// Check in and check out at one site, with no signal needed. Owner: Attendance (Manish).
// Issue #79, ADR-034. Every save goes to the outbox first, under the signed-in user;
// the screen reads the visit back from there and says "On the server" only once the
// server has accepted it (ADR-009). Location is read only inside a tap (D1), and the
// geofence figure is the phone's estimate: the database decides (ADR-021).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { estimateGeofence, type GeofenceEstimate } from '../attendance/geofence';
import type { LocationProvider, PermissionState } from '../attendance/location';
import {
  checkInVisit,
  checkOutVisit,
  istDay,
  istTime,
  visitStatusText,
  VisitError,
  type Placement,
  type StatusTone,
} from '../attendance/visit';
import { listVisits, resendWithReason, saveCheckIn, saveCheckOut, type StoredVisit } from '../attendance/visit-store';
import type { DeviceDb } from '../db/device-db';
import { istDate, readSites, type MirrorSite } from '../sync/pull';

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
      located: { lat: number; lng: number } | null;
      estimate: GeofenceEstimate | null;
      accuracyM: number | null;
    }
  | { kind: 'resend'; recordId: string };

type SiteLoad = { kind: 'loading' } | { kind: 'failed' } | { kind: 'missing' } | { kind: 'ready'; site: MirrorSite };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-19" as "19 Oct". */
function dayLabel(day: string): string {
  const month = MONTHS[Number(day.slice(5, 7)) - 1] ?? '';
  return `${Number(day.slice(8, 10))} ${month}`;
}

// A fixed sentence per failure, never the error's own text (it can name files or places).
function errorText(error: unknown): string {
  if (error instanceof VisitError) {
    switch (error.code) {
      case 'reason_required':
        return 'Say why, in a few words.';
      case 'reason_too_long':
        return 'Keep the reason under 500 characters.';
      case 'before_check_in':
        return "This phone's clock is earlier than the check-in. Fix the time on this phone and try again.";
      case 'no_org':
        return 'Connect once to refresh your sites, then try again.';
      case 'bad_coordinates':
        return 'The location was not valid. Try again.';
      case 'already_checked_out':
        return 'This visit is already checked out.';
      case 'not_found':
      case 'not_refused':
        return 'This visit cannot be changed any more.';
    }
  }
  return 'Could not save on this phone. Try again.';
}

export function SiteAttendanceScreen({
  openDb,
  userId,
  siteId,
  location,
  now = () => new Date(),
  pollMs = 3000,
}: SiteAttendanceScreenProps) {
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

  useEffect(() => {
    openDb().then(
      (opened) => {
        if (alive.current) setDb(opened);
      },
      () => {
        if (alive.current) setSiteLoad({ kind: 'failed' });
      },
    );
  }, [openDb]);

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

  async function locate(action: Action, permission: PermissionState) {
    if (!site) return;
    if (permission !== 'granted') {
      setStep({ kind: 'reason', action, cause: 'unavailable', located: null, estimate: null, accuracyM: null });
      return;
    }
    setStep({ kind: 'locating' });
    const position = await location.readPosition();
    if (!alive.current) return;
    if (position.kind === 'unavailable') {
      setStep({ kind: 'reason', action, cause: 'unavailable', located: null, estimate: null, accuracyM: null });
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

  const verb = (action: Action) => (action.kind === 'in' ? 'Check in' : 'Check out');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {siteLoad.kind === 'loading' && <Text style={styles.line}>Loading…</Text>}
        {siteLoad.kind === 'failed' && <Text style={styles.error}>Could not read the sites on this phone.</Text>}
        {siteLoad.kind === 'missing' && <Text style={styles.line}>This site is not on this phone.</Text>}

        {site && (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {site.name}
            </Text>
            <Text style={styles.sub}>{site.address}</Text>

            {site.orgId === null && (
              <Text style={styles.error}>Connect once to refresh your sites, then check in.</Text>
            )}

            {step.kind === 'explain' && (
              <View style={styles.panel}>
                <Text style={styles.line}>
                  Alarsio reads your location once, when you tap Check in or Check out, to record that you are at this
                  site.
                </Text>
                <Text style={styles.sub}>It does not track you in the background.</Text>
                <Button label="Continue" onPress={() => void continueAfterExplanation(step.action)} />
                <Button label="Not now" secondary onPress={finish} />
              </View>
            )}

            {step.kind === 'locating' && <Text style={styles.line}>Getting your location…</Text>}

            {step.kind === 'reason' && (
              <View style={styles.panel}>
                {step.cause === 'outside' && step.estimate ? (
                  <>
                    <Text style={styles.line}>
                      {`You seem to be about ${Math.round(step.estimate.distanceM)} m from this site (limit ${step.estimate.radiusM} m).`}
                    </Text>
                    {step.accuracyM !== null && (
                      <Text style={styles.sub}>{`GPS accuracy about ${Math.round(step.accuracyM)} m.`}</Text>
                    )}
                    <Text style={styles.line}>Say why you are {step.action.kind === 'in' ? 'checking in' : 'checking out'} here.</Text>
                  </>
                ) : (
                  <Text style={styles.line}>
                    {`Location is not available. Say why you are ${step.action.kind === 'in' ? 'checking in' : 'checking out'} without it.`}
                  </Text>
                )}
                <TextInput
                  accessibilityLabel="Reason"
                  style={styles.input}
                  value={reasonText}
                  onChangeText={setReasonText}
                  maxLength={500}
                  multiline
                />
                <Button
                  label={step.cause === 'outside' ? `${verb(step.action)} anyway` : `${verb(step.action)} without location`}
                  onPress={() => void submitReason(step)}
                />
                <Button label="Cancel" secondary onPress={finish} />
              </View>
            )}

            {step.kind === 'resend' && (
              <View style={styles.panel}>
                <Text style={styles.line}>Say why, and the visit is sent again.</Text>
                <TextInput
                  accessibilityLabel="Reason"
                  style={styles.input}
                  value={reasonText}
                  onChangeText={setReasonText}
                  maxLength={500}
                  multiline
                />
                <Button label="Send again" onPress={() => void submitResend(step.recordId)} />
                <Button label="Cancel" secondary onPress={finish} />
              </View>
            )}

            {message && (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {message}
              </Text>
            )}

            {step.kind === 'idle' && site.orgId !== null && !openToday && (
              <Button label="Check in" onPress={() => void begin({ kind: 'in' })} />
            )}

            {shown.map((v) => {
              const day = istDay(v.visit);
              const status = visitStatusText(v.status, v.reason);
              const open = v.visit.checkOut === null;
              const line =
                `${day === today ? '' : `${dayLabel(day)} · `}Checked in ${istTime(v.visit.checkIn.at)}` +
                (v.visit.checkOut ? ` · Checked out ${istTime(v.visit.checkOut.at)}` : '');
              return (
                <View key={v.recordId} style={styles.visit}>
                  <Text style={styles.visitLine}>{line}</Text>
                  <Text style={[styles.status, toneStyle[status.tone]]} accessibilityLiveRegion="polite">
                    {status.text}
                  </Text>
                  {step.kind === 'idle' && open && (
                    <Button
                      label={day === today ? 'Check out' : `Check out (${dayLabel(day)})`}
                      onPress={() => void begin({ kind: 'out', recordId: v.recordId })}
                    />
                  )}
                  {step.kind === 'idle' && v.status === 'rejected' && (
                    <Button
                      label="Add a reason and send again"
                      secondary
                      onPress={() => {
                        setMessage(null);
                        setReasonText('');
                        setStep({ kind: 'resend', recordId: v.recordId });
                      }}
                    />
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.button, secondary && styles.buttonSecondary]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const toneStyle: Record<StatusTone, { color: string }> = {
  wait: { color: '#555' },
  ok: { color: '#1b6e2d' },
  attention: { color: '#b00020' },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  sub: { fontSize: 14, color: '#555' },
  line: { fontSize: 16, color: '#222' },
  error: { fontSize: 16, color: '#b00020' },
  panel: { gap: 12 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10, minHeight: 80, fontSize: 16, textAlignVertical: 'top' },
  visit: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, gap: 8 },
  visitLine: { fontSize: 16, fontWeight: '500' },
  status: { fontSize: 14 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  buttonText: { color: '#fff', fontSize: 16 },
  buttonTextSecondary: { color: '#111' },
});
