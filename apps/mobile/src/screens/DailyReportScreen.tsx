// File the day's report for one site, with no signal needed. Owner: Daily Reporting
// (Anuradha). Issue #81, ADR-036. Every save goes to the outbox first, under the
// signed-in user; the screen reads the report back from there and says "Submitted"
// only once the server has accepted the submit (ADR-009). The database is the
// boundary (ADR-013): the phone's checks only say what is wrong sooner.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, RefreshControl, StyleSheet, Switch, View } from 'react-native';

import { readHeadcount } from '../attendance/headcount';
import type { DeviceDb } from '../db/device-db';
import type { PickResult } from '../reports/photo-device';
import { photoErrorText, PhotoError, photoStatusText, PHOTO_LIMITS } from '../reports/photo';
import { addPhoto, listPhotos, type PhotoFiles, type StoredPhoto } from '../reports/photo-store';
import {
  dayLabel,
  fieldsOf,
  headcountHint,
  isFlagged,
  needsReason,
  openingFields,
  reportDay,
  ReportError,
  reportErrorText,
  reportStatusText,
  sentBackNote,
  type DayAttendance,
  type ReportFields,
  type ReportStatus,
} from '../reports/report';
import { findReport, saveReport, type StoredReport } from '../reports/report-store';
import { istDate, readSites, type MirrorSite } from '../sync/pull';
import { syncNowSoon } from '../sync/request-sync';
import { colors, radius, space, tone } from '../theme';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { StatusBadge } from '../ui/StatusBadge';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { LoadFailed } from './LoadFailed';
import { ScreenTitle } from './ScreenTitle';

export interface DailyReportScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user: their reports and their copy of the sites only. */
  userId: string;
  siteId: string;
  /** The IST day, YYYY-MM-DD. Missing, not a day, or in the future means today. */
  date?: string;
  /** The phone's clock. Tests pass their own. */
  now?: () => Date;
  /** How often the screen re-reads the outbox to show the server's answer. 0 turns it off. */
  pollMs?: number;
  /** The camera, gallery and app folder (#81 PR 2). Without them the screen has no photo section. */
  photos?: {
    files: PhotoFiles;
    pick: (source: 'camera' | 'library') => Promise<PickResult>;
  };
}

type Load =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'missing' }
  | { kind: 'ready'; site: MirrorSite; stored: StoredReport | null; photoList: StoredPhoto[] };

export function DailyReportScreen({
  openDb,
  userId,
  siteId,
  date,
  now = () => new Date(),
  pollMs = 3000,
  photos,
}: DailyReportScreenProps) {
  const { t } = useTranslation();
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [form, setForm] = useState<ReportFields>(fieldsOf(null));
  const [reasonText, setReasonText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  // The day's attendance on this phone, read once when the form is filled (#109).
  const [attendance, setAttendance] = useState<DayAttendance | null>(null);
  const alive = useRef(true);
  // The form is filled from the phone once; a poll only updates the status line,
  // so it never overwrites what the supervisor is typing.
  const filled = useRef(false);
  const snapshot = useRef('');
  const busy = useRef(false);
  // What the form held when it was filled or last saved: anything else is unsaved typing,
  // kept as a draft when the supervisor leaves or Android puts the app away (phone review).
  const saved = useRef('');
  const latest = useRef<{ db: DeviceDb | null; load: Load; form: ReportFields; userId: string; day: string; now: () => Date }>({
    db: null,
    load: { kind: 'loading' },
    form: fieldsOf(null),
    userId,
    day: '',
    now,
  });

  const today = istDate(now().toISOString());
  const day = reportDay(date, today);

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
        if (alive.current) setLoad({ kind: 'failed' });
      },
    );
  }, [openDb, attempt]);

  const refresh = useCallback(async () => {
    if (!db) return;
    try {
      const site = (await readSites(db, userId)).find((s) => s.id === siteId.toLowerCase());
      const stored = site ? await findReport(db, userId, site.id, day) : null;
      const photoList = stored && photos ? await listPhotos(db, userId, stored.recordId) : [];
      // Only for the first fill, and never in the way of the report: a failed read
      // just leaves the headcount to be typed (ADR-038 D4).
      const counted =
        site && !filled.current ? await readHeadcount(db, userId, site.id, day).catch(() => null) : null;
      if (!alive.current) return;
      const read = JSON.stringify([site ?? null, stored, photoList]);
      if (read === snapshot.current) return;
      snapshot.current = read;
      if (!site) {
        setLoad({ kind: 'missing' });
        return;
      }
      if (!filled.current) {
        filled.current = true;
        setAttendance(counted);
        const opening = openingFields(stored?.report ?? null, counted);
        saved.current = JSON.stringify(opening);
        setForm(opening);
      } else if (stored && JSON.stringify(latest.current.form) === saved.current) {
        // A pull or another device changed the report and nothing was typed: show it (ADR-057 C5).
        const opening = openingFields(stored.report, null);
        saved.current = JSON.stringify(opening);
        setForm(opening);
      }
      setLoad({ kind: 'ready', site, stored, photoList });
    } catch {
      snapshot.current = '';
      // A fixed sentence: the error can name files (ADR-029).
      if (alive.current) setLoad({ kind: 'failed' });
    }
  }, [db, userId, siteId, day, photos]);

  // Pull down: sync now, so a manager's answer shows at once, then read the records again.
  const [refreshing, setRefreshing] = useState(false);
  const pullToRefresh = async () => {
    setRefreshing(true);
    await syncNowSoon();
    await refresh();
    if (alive.current) setRefreshing(false);
  };

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

  // After every render, so the handlers below see what is on screen now.
  useEffect(() => {
    latest.current = { db, load, form, userId, day, now };
  });

  // Keeps unsaved typing as a draft: on leaving the screen, and when the app goes to the
  // background (Android may then close it). Only a report that is not submitted: changing a
  // submitted one needs a reason, so that waits for Send changes. A save the rules refuse is
  // left alone; the typing is then still on screen if the app is open again.
  // Reads everything from `latest`, so it is made once and the listeners below are added once.
  const keepTyping = useCallback(() => {
    const { db: open, load: current, form: typed, userId: who, day: which, now: clock } = latest.current;
    if (busy.current || !open || current.kind !== 'ready') return;
    if (current.stored && current.stored.report.status !== 'draft') return;
    const text = JSON.stringify(typed);
    if (text === saved.current) return;
    busy.current = true;
    saveReport(open, who, current.site, which, typed, 'draft', { reason: '' }, clock())
      .then(() => {
        saved.current = text;
      })
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') keepTyping();
    });
    return () => {
      // Optional only for test doubles of AppState; the real one always returns a subscription.
      sub?.remove();
      keepTyping();
    };
  }, [keepTyping]);

  const set = <K extends keyof ReportFields>(key: K) => (value: ReportFields[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // One tap at a time: a second tap while the first is saving would race it.
  async function save(status: ReportStatus) {
    if (busy.current || !db || load.kind !== 'ready') return;
    busy.current = true;
    try {
      await saveReport(db, userId, load.site, day, form, status, { reason: reasonText }, now());
      saved.current = JSON.stringify(form);
      if (!alive.current) return;
      setMessage(null);
      setReasonText('');
      await refresh();
    } catch (error) {
      if (alive.current) setMessage(reportErrorText(error));
    } finally {
      busy.current = false;
    }
  }

  // One tap at a time, like save: a second tap while the camera is open would add a second photo.
  async function addFrom(source: 'camera' | 'library') {
    if (busy.current || !db || !photos || load.kind !== 'ready') return;
    busy.current = true;
    try {
      const picked = await photos.pick(source);
      if (!alive.current) return;
      if (picked.kind === 'cancelled') return;
      if (picked.kind === 'denied') {
        setMessage(t('dailyReport.photoDenied'));
        return;
      }
      if (picked.kind === 'failed') {
        setMessage(photoErrorText(null));
        return;
      }
      // A photo can come first: with no report yet, the form so far is saved as a draft
      // (the same save, so offline and validation behave as ever), then the photo is
      // attached to it. A refused draft keeps the photo out and says why.
      let target = load.stored;
      if (!target) {
        await saveReport(db, userId, load.site, day, form, 'draft', { reason: '' }, now());
        target = await findReport(db, userId, load.site.id, day);
        if (!target) throw new ReportError('not_found');
      }
      await addPhoto(db, userId, target, picked.uri, photos.files, now());
      if (!alive.current) return;
      setMessage(null);
      await refresh();
    } catch (error) {
      if (alive.current) setMessage(error instanceof ReportError ? reportErrorText(error) : photoErrorText(error));
    } finally {
      busy.current = false;
    }
  }

  if (load.kind !== 'ready') {
    return (
      <Screen>
        <ScreenTitle screen="daily_report" />
        {load.kind === 'loading' && <Text>{t('common.loading')}</Text>}
        {load.kind === 'failed' && <LoadFailed message={t('dailyReport.loadFailed')} onRetry={retry} />}
        {load.kind === 'missing' && <EmptyState title={t('dailyReport.missing')} hint={t('dailyReport.missingHint')} />}
      </Screen>
    );
  }

  const { site, stored } = load;
  const reviewed = stored?.status === 'conflict' && stored.reason === 'reviewed';
  const editing = needsReason(stored?.report ?? null);
  const editable = !reviewed;
  const status = stored ? reportStatusText(stored.report.status, stored.status, stored.reason, sentBackNote(stored)) : null;
  const title = t(day === today ? 'dailyReport.reportForToday' : 'dailyReport.reportFor', { day: dayLabel(day) });
  const flagged: string[] = [];
  if (form.seriousBlocker) flagged.push(t('dailyReport.seriousBlocker'));
  if (form.safetyIncident) flagged.push(t('dailyReport.safetyIncident'));

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pullToRefresh()} />}>
      <ScreenTitle screen="daily_report" siteName={site.name} />
      <Text variant="title" bold accessibilityRole="header">
        {site.name}
      </Text>
      <Text variant="heading">{title}</Text>
      {site.orgId === null && (
        <Text color={tone.attention.text}>{t('dailyReport.error.no_org')}</Text>
      )}
      {status && (
        <View accessibilityLiveRegion="polite">
          <StatusBadge tone={status.tone} label={status.text} />
        </View>
      )}

      <View style={styles.field}>
        <TextField
          label={t('dailyReport.headcount')}
          value={form.headcount}
          onChangeText={set('headcount')}
          keyboardType="number-pad"
          editable={editable}
        />
        {attendance && (
          <Text variant="small" color={colors.muted}>
            {headcountHint(attendance)}
          </Text>
        )}
      </View>
      <TextField
        label={t('dailyReport.workDone')}
        value={form.workDone}
        onChangeText={set('workDone')}
        multiline
        editable={editable}
      />
      <TextField
        label={t('dailyReport.blockers')}
        value={form.blockers}
        onChangeText={set('blockers')}
        multiline
        editable={editable}
      />
      <SwitchRow
        label={t('dailyReport.seriousBlocker')}
        value={form.seriousBlocker}
        onChange={set('seriousBlocker')}
        disabled={!editable}
      />
      <SwitchRow
        label={t('dailyReport.safetyIncident')}
        value={form.safetyIncident}
        onChange={set('safetyIncident')}
        disabled={!editable}
      />
      <TextField
        label={t('dailyReport.nextDayPlan')}
        value={form.nextDayPlan}
        onChangeText={set('nextDayPlan')}
        multiline
        editable={editable}
      />

      {isFlagged(form) && (
        <View style={styles.flag} accessibilityLiveRegion="polite">
          <Text bold color={tone.attention.text}>
            {t('dailyReport.flag', {
              what: flagged.length === 2 ? t('dailyReport.and', { first: flagged[0], second: flagged[1] }) : flagged[0],
            })}
          </Text>
        </View>
      )}

      {editing && editable && (
        <TextField label={t('dailyReport.changeReason')} value={reasonText} onChangeText={setReasonText} multiline />
      )}

      {photos && (
        <View style={styles.section}>
          <Text variant="small" bold color={colors.muted} accessibilityRole="header">
            {t('dailyReport.photos')}
          </Text>
          {load.photoList.map((p, i) => {
            const shown = photoStatusText(p.outbox ?? 'pending', p.reason, p.state);
            return (
              <View key={p.recordId} accessibilityLiveRegion="polite">
                <StatusBadge tone={shown.tone} label={t('dailyReport.photoLine', { n: i + 1, status: shown.text })} />
              </View>
            );
          })}
          {load.photoList.length >= PHOTO_LIMITS.perReport && <Text>{photoErrorText(new PhotoError('too_many'))}</Text>}
          {load.photoList.length < PHOTO_LIMITS.perReport && (
            <>
              <Button kind="secondary" label={t('dailyReport.takePhoto')} onPress={() => void addFrom('camera')} />
              <Button kind="secondary" label={t('dailyReport.choosePhoto')} onPress={() => void addFrom('library')} />
            </>
          )}
        </View>
      )}

      {message && (
        <Text color={tone.attention.text} accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}

      {editable && (
        <View style={styles.section}>
          {!editing && <Button kind="secondary" label={t('dailyReport.saveDraft')} onPress={() => void save('draft')} />}
          <Button
            label={editing ? t('dailyReport.sendChanges') : t('dailyReport.submit')}
            onPress={() => void save('submitted')}
          />
          <Text variant="small" color={colors.muted}>
            {editing ? t('dailyReport.noteEditing') : t('dailyReport.noteDraft')}
          </Text>
        </View>
      )}
    </Screen>
  );
}

function SwitchRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.switchRow}>
      <Text bold style={styles.switchLabel}>
        {label}
      </Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  section: { gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  switchLabel: { flex: 1 },
  flag: {
    borderWidth: 2,
    borderColor: tone.attention.text,
    borderRadius: radius.card,
    padding: space.md,
    backgroundColor: tone.attention.tint,
  },
});
