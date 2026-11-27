// One worker's month at a site: every day marked, the summary, and a way to mark or change a day,
// with no signal. Owner: Attendance (Manish). Issue #234, ADR-053. Marks are saved through the
// day register's saveMark, so the same outbox, roster and approved-day rules apply. A day the
// phone knows is approved is read-only here: its change is a correction in the day register.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { dayLabel, markParts, monthLabel } from '../attendance/labels';
import { shiftMonth } from '../attendance/month';
import { readWorkerMonth, type MonthDay, type WorkerMonth } from '../attendance/month-store';
import { cleanMark, entryStatusText, type EntryStatus, type Mark } from '../attendance/register';
import { saveMark } from '../attendance/register-store';
import type { DeviceDb } from '../db/device-db';
import i18n from '../i18n';
import { istDate, readSites, readSiteWorkers, type MirrorSite, type RosterWorker } from '../sync/pull';
import { colors, space, tone } from '../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { StatusBadge } from '../ui/StatusBadge';
import { Text } from '../ui/Text';
import { errorText } from './DayRegisterScreen';
import { LoadFailed } from './LoadFailed';
import { MarkFields } from './MarkFields';
import { ScreenTitle } from './ScreenTitle';

export interface WorkerMonthScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user: their entries and their copy of the roster only. */
  userId: string;
  siteId: string;
  /** The phone's clock. Tests pass their own. */
  now?: () => Date;
  /** How often the screen re-reads the outbox to show a verdict. 0 turns it off. */
  pollMs?: number;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'missing' }
  | { kind: 'ready'; site: MirrorSite; workers: RosterWorker[]; month: WorkerMonth | null };

function dayText(day: MonthDay): string {
  const t = i18n.t.bind(i18n);
  const parts = [dayLabel(day.date)];
  if (day.mark) parts.push(...markParts(day.mark));
  else if (day.blocked) parts.push(day.blocked === 'future' ? t('workerMonth.notYet') : t('workerMonth.notOnSite'));
  else if (!day.locked) parts.push(t('workerMonth.notMarked'));
  if (day.locked) parts.push(t('workerMonth.approved'));
  return parts.join(' · ');
}

export function WorkerMonthScreen({ openDb, userId, siteId, now = () => new Date(), pollMs = 3000 }: WorkerMonthScreenProps) {
  const { t } = useTranslation();
  const thisMonth = istDate(now().toISOString()).slice(0, 7);
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [month, setMonth] = useState(thisMonth);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState<EntryStatus>('present');
  const [overtime, setOvertime] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);
  const snapshot = useRef('');
  const busy = useRef(false);
  // Only the newest read may show: a slow read of a worker or month left behind must not overwrite it.
  const latestRead = useRef(0);

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
    const ticket = ++latestRead.current;
    try {
      const site = (await readSites(db, userId)).find((s) => s.id === siteId);
      const workers = site ? await readSiteWorkers(db, userId, siteId) : [];
      const read = site && workerId ? await readWorkerMonth(db, userId, siteId, workerId, month, now()) : null;
      if (!alive.current || ticket !== latestRead.current) return;
      const snap = JSON.stringify([site ?? null, workers, read]);
      if (snap === snapshot.current) return;
      snapshot.current = snap;
      setLoad(site ? { kind: 'ready', site, workers, month: read } : { kind: 'missing' });
    } catch {
      if (!alive.current || ticket !== latestRead.current) return;
      snapshot.current = '';
      setLoad({ kind: 'failed' });
    }
    // `now` is the phone's clock: a new function each render must not restart the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, userId, siteId, workerId, month]);

  const retry = () => {
    snapshot.current = '';
    setAttempt((n) => n + 1);
    void refresh();
  };

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const tick = db && pollMs > 0 ? setInterval(() => void refresh(), pollMs) : undefined;
    return () => {
      clearTimeout(first);
      if (tick) clearInterval(tick);
    };
  }, [db, refresh, pollMs]);

  // One tap at a time, so a double tap cannot save twice.
  async function once(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await work();
    } catch (error) {
      if (alive.current) setMessage(errorText(error));
    } finally {
      busy.current = false;
    }
  }

  function closeEditor() {
    setEditing(null);
    setMessage(null);
  }

  function openEditor(day: MonthDay) {
    setStatus(day.mark?.status ?? 'present');
    setOvertime(day.mark && day.mark.overtimeHours > 0 ? String(day.mark.overtimeHours) : '');
    setNote(day.note ?? '');
    setMessage(null);
    setEditing(day.date);
  }

  const ready = load.kind === 'ready' ? load : null;
  const site = ready?.site ?? null;
  const worker = ready?.workers.find((w) => w.workerId === workerId) ?? null;

  const saveDay = (date: string, mark: () => Mark) =>
    once(async () => {
      if (!db || !site || !workerId) return;
      await saveMark(db, userId, site, date, workerId, mark(), now());
      closeEditor();
      snapshot.current = '';
      await refresh();
    });

  const quick = (date: string, quickStatus: EntryStatus) =>
    saveDay(date, () => ({ status: quickStatus, overtimeHours: 0, note: null }));

  function choose(id: string | null) {
    closeEditor();
    snapshot.current = '';
    setWorkerId(id);
    setMonth(thisMonth);
  }

  const data = ready?.month ?? null;
  const summary = data?.summary;

  return (
    <Screen>
      {load.kind === 'loading' && <Text color={colors.muted}>{t('common.loading')}</Text>}
      {load.kind === 'failed' && <LoadFailed message={t('attendance.sitesReadFailed')} onRetry={retry} />}
      {load.kind === 'missing' && <Text>{t('attendance.siteMissing')}</Text>}

      {site && (
        <>
          <ScreenTitle screen="worker_month" siteName={site.name} />
          <Text variant="heading" accessibilityRole="header">
            {worker ? worker.name : site.name}
          </Text>

          {!workerId && (
            <>
              <Text color={colors.muted}>{t('workerMonth.chooseWorker')}</Text>
              {ready!.workers.length === 0 && <Text>{t('workerMonth.noWorkers')}</Text>}
              {ready!.workers.map((w) => (
                <Card key={w.workerId}>
                  <Text bold>{w.name}</Text>
                  <Text variant="small" color={colors.muted}>{`${w.code} · ${w.trade}`}</Text>
                  <Button label={t('workerMonth.open', { name: w.name })} kind="secondary" onPress={() => choose(w.workerId)} />
                </Card>
              ))}
            </>
          )}

          {workerId && (
            <>
              <Text color={colors.muted}>{worker ? `${worker.code} · ${worker.trade}` : t('workerMonth.workerMissing')}</Text>
              <Button label={t('workerMonth.back')} kind="secondary" onPress={() => choose(null)} />

              <View style={styles.row}>
                <Button
                  label={t('workerMonth.earlierMonth')}
                  kind="secondary"
                  style={styles.grow}
                  disabled={month <= shiftMonth(thisMonth, -1)}
                  onPress={() => {
                    closeEditor();
                    setMonth(shiftMonth(month, -1));
                  }}
                />
                <Button
                  label={t('workerMonth.laterMonth')}
                  kind="secondary"
                  style={styles.grow}
                  disabled={month >= thisMonth}
                  onPress={() => {
                    closeEditor();
                    setMonth(shiftMonth(month, 1));
                  }}
                />
              </View>
              <Text variant="heading">{monthLabel(month)}</Text>

              {site.orgId === null && <Text color={tone.attention.text}>{t('attendance.connectToCheckIn')}</Text>}
              {message && (
                <Text color={tone.attention.text} accessibilityLiveRegion="polite">
                  {message}
                </Text>
              )}

              {data && !data.available && <Text>{t('workerMonth.tooOld')}</Text>}

              {summary && data?.available && (
                <Card>
                  <Text>
                    {t('workerMonth.summary', {
                      present: summary.present,
                      halfDays: summary.halfDays,
                      leave: summary.leave,
                      absent: summary.absent,
                      notMarked: summary.notMarked,
                    })}
                  </Text>
                  <Text>{t('workerMonth.pay', { days: summary.payableDays, hours: summary.overtimeHours })}</Text>
                </Card>
              )}

              {data?.days.map((day) => {
                const canMark = site.orgId !== null && !day.locked && day.blocked === null;
                const sync = day.sync ? entryStatusText(day.sync.status, day.sync.verdictReason) : null;
                const label = dayLabel(day.date);
                return (
                  <Card key={day.date}>
                    <Text>{dayText(day)}</Text>
                    {sync && (
                      <View accessibilityLiveRegion="polite">
                        <StatusBadge tone={sync.tone} label={sync.text} />
                      </View>
                    )}

                    {canMark && editing !== day.date && (
                      <View style={styles.row}>
                        {day.mark ? (
                          <Button
                            label={t('workerMonth.change')}
                            accessibilityLabel={t('workerMonth.changeDay', { day: label })}
                            kind="secondary"
                            style={styles.grow}
                            onPress={() => openEditor(day)}
                          />
                        ) : (
                          <>
                            <Button
                              label={t('workerMonth.present')}
                              accessibilityLabel={t('workerMonth.presentDay', { day: label })}
                              style={styles.grow}
                              onPress={() => void quick(day.date, 'present')}
                            />
                            <Button
                              label={t('workerMonth.absent')}
                              accessibilityLabel={t('workerMonth.absentDay', { day: label })}
                              kind="secondary"
                              style={styles.grow}
                              onPress={() => void quick(day.date, 'absent')}
                            />
                            <Button
                              label={t('workerMonth.more')}
                              accessibilityLabel={t('workerMonth.moreDay', { day: label })}
                              kind="secondary"
                              style={styles.grow}
                              onPress={() => openEditor(day)}
                            />
                          </>
                        )}
                      </View>
                    )}

                    {editing === day.date && (
                      <View style={styles.panel}>
                        <MarkFields
                          status={status}
                          onStatus={setStatus}
                          overtime={overtime}
                          onOvertime={setOvertime}
                          note={note}
                          onNote={setNote}
                        />
                        <Button label={t('fields.save')} onPress={() => void saveDay(day.date, () => cleanMark({ status, overtime, note }))} />
                        <Button label={t('fields.cancel')} kind="secondary" onPress={closeEditor} />
                      </View>
                    )}
                  </Card>
                );
              })}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  grow: { flexGrow: 1 },
  panel: { gap: space.md },
});
