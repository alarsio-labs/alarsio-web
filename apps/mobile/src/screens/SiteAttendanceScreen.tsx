// Check in and check out at one site, with no signal needed. Owner: Attendance (Manish).
// Issue #79, ADR-034. Every save goes to the outbox first, under the signed-in user;
// the screen reads the visit back from there and says "On the server" only once the
// server has accepted it (ADR-009). Location is read only inside a tap (D1), and the
// geofence figure is the phone's estimate: the database decides (ADR-021).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Share, View } from 'react-native';

import { buildDaySlip } from '../attendance/day-slip';
import { estimateGeofence, type GeofenceEstimate } from '../attendance/geofence';
import { dayLabel } from '../attendance/labels';
import type { LocationProvider, PermissionState, UnavailableCause } from '../attendance/location';
import { locationProblemText, opensSettings } from '../attendance/location-text';
import {
  checkInVisit,
  checkOutVisit,
  istDay,
  istTime,
  visitStatusText,
  VisitError,
  type Placement,
  type VisitErrorCode,
} from '../attendance/visit';
import { listVisits, resendWithReason, saveCheckIn, saveCheckOut, type StoredVisit } from '../attendance/visit-store';
import type { DeviceDb } from '../db/device-db';
import i18n from '../i18n';
import { istDate, readSites, type MirrorSite } from '../sync/pull';
import { colors, tone } from '../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { StatusBadge } from '../ui/StatusBadge';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { LoadFailed } from './LoadFailed';
import { ScreenTitle } from './ScreenTitle';

export interface SiteAttendanceScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user: their visits and their copy of the sites only. */
  userId: string;
  siteId: string;
  location: LocationProvider;
  /** The phone's clock. Tests pass their own. */
  now?: () => Date;
  /** How often the screen re-reads the outbox to show a verdict. 0 turns it off. */
  pollMs?: number;
  /** Opens the day register for this site (#79, ADR-048). No button without it. */
  onOpenRegister?: () => void;
  /** Opens one worker's month for this site (#234, ADR-053). No button without it. */
  onOpenWorkers?: () => void;
  /** Opens the advances for this site (#239, ADR-054). No button without it. */
  onOpenAdvances?: () => void;
}

type Action = { kind: 'in' } | { kind: 'out'; recordId: string };

type Step =
  | { kind: 'idle' }
  | { kind: 'explain'; action: Action }
  | { kind: 'locating' }
  | {
      kind: 'reason';
      action: Action;
      cause: 'outside' | 'unavailable';
      /** Why there is no location, when cause is 'unavailable'. */
      unavailable?: UnavailableCause;
      located: { lat: number; lng: number } | null;
      estimate: GeofenceEstimate | null;
      accuracyM: number | null;
    }
  | { kind: 'resend'; recordId: string };

type SiteLoad = { kind: 'loading' } | { kind: 'failed' } | { kind: 'missing' } | { kind: 'ready'; site: MirrorSite };

// A fixed sentence per failure, never the error's own text (it can name files or places).
const ERRORS = {
  no_org: 'attendance.error.noOrg',
  bad_coordinates: 'attendance.error.badCoordinates',
  reason_required: 'attendance.error.reasonRequired',
  reason_too_long: 'attendance.error.reasonTooLong',
  before_check_in: 'attendance.error.beforeCheckIn',
  already_checked_out: 'attendance.error.alreadyCheckedOut',
  not_found: 'attendance.error.cannotChange',
  not_refused: 'attendance.error.cannotChange',
} as const satisfies Record<VisitErrorCode, string>;

function errorText(error: unknown): string {
  return i18n.t(error instanceof VisitError ? ERRORS[error.code] : 'attendance.error.saveFailed');
}

export function SiteAttendanceScreen({
  openDb,
  userId,
  siteId,
  location,
  now = () => new Date(),
  pollMs = 3000,
  onOpenRegister,
  onOpenWorkers,
  onOpenAdvances,
}: SiteAttendanceScreenProps) {
  const { t } = useTranslation();
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [siteLoad, setSiteLoad] = useState<SiteLoad>({ kind: 'loading' });
  const [visits, setVisits] = useState<StoredVisit[]>([]);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [reasonText, setReasonText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);
  // The last thing read, so a poll that finds nothing new changes nothing on screen.
  const snapshot = useRef('');
  const busy = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Bumped by Try again: opens the database again if that is what failed.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    openDb().then(
      (opened) => {
        if (alive.current) setDb(opened);
      },
      () => {
        if (alive.current) setSiteLoad({ kind: 'failed' });
      },
    );
  }, [openDb, attempt]);

  const refresh = useCallback(async () => {
    if (!db) return;
    try {
      const sites = await readSites(db, userId);
      const site = sites.find((s) => s.id === siteId);
      const list = site ? await listVisits(db, userId, siteId) : [];
      if (!alive.current) return;
      const read = JSON.stringify([site ?? null, list]);
      if (read === snapshot.current) return;
      snapshot.current = read;
      setSiteLoad(site ? { kind: 'ready', site } : { kind: 'missing' });
      setVisits(list);
    } catch {
      snapshot.current = '';
      if (alive.current) setSiteLoad({ kind: 'failed' });
    }
  }, [db, userId, siteId]);

  // Try again: open the database again if it failed to open, and read the records again.
  const retry = () => {
    snapshot.current = '';
    setAttempt((n) => n + 1);
    void refresh();
  };

  useEffect(() => {
    // First read as soon as the database is open, then on a slow tick so a verdict shows.
    const first = setTimeout(() => void refresh(), 0);
    const tick = db && pollMs > 0 ? setInterval(() => void refresh(), pollMs) : undefined;
    return () => {
      clearTimeout(first);
      if (tick) clearInterval(tick);
    };
  }, [db, refresh, pollMs]);

  const today = istDate(now().toISOString());
  // Today's visits, any still open, and anything the server refused or kept its own version of.
  const shown = visits
    .filter((v) => istDay(v.visit) === today || v.visit.checkOut === null || v.status === 'conflict' || v.status === 'rejected')
    .slice(0, 10);
  const openToday = visits.some((v) => v.visit.checkOut === null && istDay(v.visit) === today);

  const site = siteLoad.kind === 'ready' ? siteLoad.site : null;

  function finish() {
    setStep({ kind: 'idle' });
    setReasonText('');
  }

  /** Builds the visit from the placement and saves it. Anything refused is said, and nothing is written. */
  async function commit(action: Action, placement: Placement) {
    if (!db || !site) return;
    try {
      const at = now();
      if (action.kind === 'in') {
        await saveCheckIn(db, userId, checkInVisit(site, placement, at), at);
      } else {
        const open = visits.find((v) => v.recordId === action.recordId);
        if (!open) throw new VisitError('not_found');
        await saveCheckOut(db, userId, open.recordId, checkOutVisit(open.visit, placement, at), at);
      }
      setMessage(null);
      finish();
      await refresh();
    } catch (error) {
      if (!alive.current) return;
      setMessage(errorText(error));
      // A refused check-out has nothing to retype: go back to the visit. The rest stay where they are.
      if (error instanceof VisitError && error.code === 'before_check_in') finish();
    }
  }

  // Try location again: after turning location on, allowing it in Settings or stepping outside.
  // Asks once more only if the phone never asked; a refused permission is changed in Settings.
  async function retryLocation(action: Action) {
    let permission = await location.getPermission();
    if (permission === 'undetermined') permission = await location.requestPermission();
    if (!alive.current) return;
    await locate(action, permission);
  }

  async function locate(action: Action, permission: PermissionState) {
    if (!site) return;
    if (permission !== 'granted') {
      setStep({ kind: 'reason', action, cause: 'unavailable', unavailable: 'denied', located: null, estimate: null, accuracyM: null });
      return;
    }
    setStep({ kind: 'locating' });
    const position = await location.readPosition();
    if (!alive.current) return;
    if (position.kind === 'unavailable') {
      setStep({ kind: 'reason', action, cause: 'unavailable', unavailable: position.cause, located: null, estimate: null, accuracyM: null });
      return;
    }
    const estimate = estimateGeofence(site, position);
    if (estimate.outside) {
      setStep({
        kind: 'reason',
        action,
        cause: 'outside',
        located: { lat: position.lat, lng: position.lng },
        estimate,
        accuracyM: position.accuracyM,
      });
      return;
    }
    await commit(action, { kind: 'located', lat: position.lat, lng: position.lng, reason: null });
  }

  // One tap at a time: a second tap while the first is still reading the location or
  // saving would write a second visit.
  async function once(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await work();
    } finally {
      busy.current = false;
    }
  }

  const begin = (action: Action) =>
    once(async () => {
      setMessage(null);
      setReasonText('');
      const permission = await location.getPermission();
      if (!alive.current) return;
      if (permission === 'undetermined') {
        setStep({ kind: 'explain', action });
        return;
      }
      await locate(action, permission);
    });

  const continueAfterExplanation = (action: Action) =>
    once(async () => {
      const permission = await location.requestPermission();
      if (!alive.current) return;
      await locate(action, permission);
    });

  async function submitReason(s: Extract<Step, { kind: 'reason' }>) {
    if (reasonText.trim() === '') {
      setMessage(errorText(new VisitError('reason_required')));
      return;
    }
    const placement: Placement =
      s.cause === 'outside' && s.located
        ? { kind: 'located', lat: s.located.lat, lng: s.located.lng, reason: reasonText }
        : { kind: 'unavailable', reason: reasonText };
    await once(() => commit(s.action, placement));
  }

  const submitResend = (recordId: string) =>
    once(async () => {
      if (!db) return;
      try {
        await resendWithReason(db, userId, recordId, reasonText, now());
        setMessage(null);
        finish();
        await refresh();
      } catch (error) {
        if (alive.current) setMessage(errorText(error));
      }
    });

  const submitLabel = (s: Extract<Step, { kind: 'reason' }>) => {
    const out = s.action.kind === 'out';
    if (s.cause === 'outside') return out ? t('attendance.checkOutAnyway') : t('attendance.checkInAnyway');
    return out ? t('attendance.checkOutWithout') : t('attendance.checkInWithout');
  };

  const shareSlip = () =>
    once(async () => {
      if (!db || !site) return;
      try {
        await Share.share({ message: await buildDaySlip(db, userId, site, today) });
      } catch {
        if (alive.current) setMessage(t('attendance.slipFailed'));
      }
    });

  const reasonField = (
    <TextField label={t('attendance.reason')} value={reasonText} onChangeText={setReasonText} maxLength={500} multiline />
  );

  return (
    <Screen>
      {siteLoad.kind === 'loading' && <Text color={colors.muted}>{t('common.loading')}</Text>}
      {siteLoad.kind === 'failed' && <LoadFailed message={t('attendance.sitesReadFailed')} onRetry={retry} />}
      {siteLoad.kind === 'missing' && <Text>{t('attendance.siteMissing')}</Text>}

      {site && (
        <>
          <ScreenTitle screen="check_in" siteName={site.name} />
          <Text color={colors.muted}>{site.address}</Text>

          {site.orgId === null && <Text color={tone.attention.text}>{t('attendance.connectToCheckIn')}</Text>}

          {step.kind === 'explain' && (
            <Card>
              <Text>{t('attendance.explain')}</Text>
              <Text variant="small" color={colors.muted}>
                {t('attendance.noTracking')}
              </Text>
              <Button label={t('attendance.continue')} onPress={() => void continueAfterExplanation(step.action)} />
              <Button label={t('attendance.notNow')} kind="secondary" onPress={finish} />
            </Card>
          )}

          {step.kind === 'locating' && <Text color={colors.muted}>{t('attendance.locating')}</Text>}

          {step.kind === 'reason' && (
            <Card>
              {step.cause === 'outside' && step.estimate ? (
                <>
                  <Text>
                    {t('attendance.outside', { distance: Math.round(step.estimate.distanceM), limit: step.estimate.radiusM })}
                  </Text>
                  {step.accuracyM !== null && (
                    <Text variant="small" color={colors.muted}>
                      {t('attendance.accuracy', { accuracy: Math.round(step.accuracyM) })}
                    </Text>
                  )}
                  <Text>{step.action.kind === 'in' ? t('attendance.sayWhyIn') : t('attendance.sayWhyOut')}</Text>
                </>
              ) : (
                <>
                  <Text>{locationProblemText(step.unavailable ?? 'error', step.action.kind)}</Text>
                  <Button label={t('attendance.tryLocationAgain')} kind="secondary" onPress={() => void retryLocation(step.action)} />
                  {opensSettings(step.unavailable ?? 'error') && (
                    <Button
                      label={t('attendance.openSettings')}
                      kind="secondary"
                      onPress={() => void Linking.openSettings().catch(() => undefined)}
                    />
                  )}
                </>
              )}
              {reasonField}
              <Button label={submitLabel(step)} onPress={() => void submitReason(step)} />
              <Button label={t('fields.cancel')} kind="secondary" onPress={finish} />
            </Card>
          )}

          {step.kind === 'resend' && (
            <Card>
              <Text>{t('attendance.resendPrompt')}</Text>
              {reasonField}
              <Button label={t('attendance.sendAgain')} onPress={() => void submitResend(step.recordId)} />
              <Button label={t('fields.cancel')} kind="secondary" onPress={finish} />
            </Card>
          )}

          {message && (
            <Text color={tone.attention.text} accessibilityLiveRegion="polite">
              {message}
            </Text>
          )}

          {step.kind === 'idle' && site.orgId !== null && !openToday && (
            <Button label={t('attendance.checkIn')} onPress={() => void begin({ kind: 'in' })} />
          )}

          {step.kind === 'idle' && site.orgId !== null && onOpenRegister && (
            <Button label={t('attendance.dayRegister')} kind="secondary" onPress={onOpenRegister} />
          )}

          {step.kind === 'idle' && site.orgId !== null && onOpenWorkers && (
            <Button label={t('attendance.workers')} kind="secondary" onPress={onOpenWorkers} />
          )}

          {step.kind === 'idle' && site.orgId !== null && onOpenAdvances && (
            <Button label={t('attendance.advances')} kind="secondary" onPress={onOpenAdvances} />
          )}
          {step.kind === 'idle' && <Button label={t('attendance.shareSlip')} kind="secondary" onPress={() => void shareSlip()} />}

          {shown.map((v) => {
            const day = istDay(v.visit);
            const status = visitStatusText(v.status, v.reason);
            const open = v.visit.checkOut === null;
            const line = [
              day === today ? null : dayLabel(day),
              t('attendance.checkedIn', { time: istTime(v.visit.checkIn.at) }),
              v.visit.checkOut ? t('attendance.checkedOut', { time: istTime(v.visit.checkOut.at) }) : null,
            ]
              .filter((part) => part !== null)
              .join(' · ');
            return (
              <Card key={v.recordId}>
                <Text bold>{line}</Text>
                <View accessibilityLiveRegion="polite">
                  <StatusBadge tone={status.tone} label={status.text} />
                </View>
                {step.kind === 'idle' && open && (
                  <Button
                    label={day === today ? t('attendance.checkOut') : t('attendance.checkOutDay', { day: dayLabel(day) })}
                    onPress={() => void begin({ kind: 'out', recordId: v.recordId })}
                  />
                )}
                {step.kind === 'idle' && v.status === 'rejected' && (
                  <Button
                    label={t('attendance.addReasonResend')}
                    kind="secondary"
                    onPress={() => {
                      setMessage(null);
                      setReasonText('');
                      setStep({ kind: 'resend', recordId: v.recordId });
                    }}
                  />
                )}
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
