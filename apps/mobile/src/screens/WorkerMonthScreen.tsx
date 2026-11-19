// One worker's month at a site: every day marked, the summary, and a way to mark or change a day,
// with no signal. Owner: Attendance (Manish). Issue #234, ADR-053. Marks are saved through the
// day register's saveMark, so the same outbox, roster and approved-day rules apply. A day the
// phone knows is approved is read-only here: its change is a correction in the day register.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shiftMonth, type DayMark } from '../attendance/month';
import { readWorkerMonth, type MonthDay, type WorkerMonth } from '../attendance/month-store';
import { cleanMark, ENTRY_STATUSES, entryStatusText, type EntryStatus, type Mark } from '../attendance/register';
import { saveMark } from '../attendance/register-store';
import type { DeviceDb } from '../db/device-db';
import { istDate, readSites, readSiteWorkers, type MirrorSite, type RosterWorker } from '../sync/pull';
import { Button, errorText, STATUS_LABEL } from './DayRegisterScreen';
import { LoadFailed } from './LoadFailed';
import { ScreenTitle } from './ScreenTitle';
import { colors, radius, tone } from '../theme';

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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayLabel = (date: string) => `${Number(date.slice(8, 10))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]!.slice(0, 3)}`;
const monthLabel = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

const markText = (m: DayMark) =>
  [STATUS_LABEL[m.status], ...(m.overtimeHours > 0 ? [`${m.overtimeHours} h overtime`] : [])].join(' · ');

function dayText(day: MonthDay): string {
  const parts = [dayLabel(day.date)];
  if (day.mark) parts.push(markText(day.mark));
  else if (day.blocked) parts.push(day.blocked === 'future' ? 'Not yet' : 'Not on this site');
  else if (!day.locked) parts.push('Not marked');
  if (day.locked) parts.push('Approved · change it from the day register');
  return parts.join(' · ');
}

export function WorkerMonthScreen({ openDb, userId, siteId, now = () => new Date(), pollMs = 3000 }: WorkerMonthScreenProps) {
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
      const site = (await readSites(db, userId)).find((s) => s.id === siteId);
      const workers = site ? await readSiteWorkers(db, userId, siteId) : [];
      const read = site && workerId ? await readWorkerMonth(db, userId, siteId, workerId, month, now()) : null;
      if (!alive.current) return;
      const snap = JSON.stringify([site ?? null, workers, read]);
      if (snap === snapshot.current) return;
      snapshot.current = snap;
      setLoad(site ? { kind: 'ready', site, workers, month: read } : { kind: 'missing' });
    } catch {
      snapshot.current = '';
      if (alive.current) setLoad({ kind: 'failed' });
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
    setNote('');
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {load.kind === 'loading' && <Text style={styles.line}>Loading…</Text>}
        {load.kind === 'failed' && <LoadFailed message="Could not read the records on this phone." onRetry={retry} />}
        {load.kind === 'missing' && <Text style={styles.line}>This site is not on this phone.</Text>}

        {site && (
          <>
            <ScreenTitle screen="worker_month" siteName={site.name} />
            <Text style={styles.title} accessibilityRole="header">
              {worker ? worker.name : site.name}
            </Text>

            {!workerId && (
              <>
                <Text style={styles.sub}>Choose a worker to see their month.</Text>
                {ready!.workers.length === 0 && <Text style={styles.line}>No workers are on the roster at this site on this phone.</Text>}
                {ready!.workers.map((w) => (
                  <View key={w.workerId} style={styles.card}>
                    <Text style={styles.name}>{w.name}</Text>
                    <Text style={styles.sub}>{`${w.code} · ${w.trade}`}</Text>
                    <Button label={`Open ${w.name}`} secondary onPress={() => choose(w.workerId)} />
                  </View>
                ))}
              </>
            )}

            {workerId && (
              <>
                <Text style={styles.sub}>{worker ? `${worker.code} · ${worker.trade}` : 'This worker is not on this phone.'}</Text>
                <Button label="Back to workers" secondary onPress={() => choose(null)} />

                <View style={styles.row}>
                  <Button
                    label="Earlier month"
                    secondary
                    disabled={month <= shiftMonth(thisMonth, -1)}
                    onPress={() => {
                      closeEditor();
                      setMonth(shiftMonth(month, -1));
                    }}
                  />
                  <Button
                    label="Later month"
                    secondary
                    disabled={month >= thisMonth}
                    onPress={() => {
                      closeEditor();
                      setMonth(shiftMonth(month, 1));
                    }}
                  />
                </View>
                <Text style={styles.name}>{monthLabel(month)}</Text>

                {site.orgId === null && <Text style={styles.error}>Connect once to refresh your sites, then mark attendance.</Text>}
                {message && (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {message}
                  </Text>
                )}

                {data && !data.available && <Text style={styles.line}>This month is older than this phone keeps. Open it on the web.</Text>}

                {summary && data?.available && (
                  <View style={styles.card}>
                    <Text style={styles.line}>
                      {`Present ${summary.present} · Half days ${summary.halfDays} · Leave ${summary.leave} · Absent ${summary.absent} · Not marked ${summary.notMarked}`}
                    </Text>
                    <Text style={styles.line}>{`Payable days ${summary.payableDays} · Overtime ${summary.overtimeHours} h`}</Text>
                  </View>
                )}

                {data?.days.map((day) => {
                  const canMark = site.orgId !== null && !day.locked && day.blocked === null;
                  const sync = day.sync ? entryStatusText(day.sync.status, day.sync.verdictReason) : null;
                  const label = dayLabel(day.date);
                  return (
                    <View key={day.date} style={styles.card}>
                      <Text style={styles.line}>{dayText(day)}</Text>
                      {sync && (
                        <Text style={[styles.status, toneStyle[sync.tone]]} accessibilityLiveRegion="polite">
                          {sync.text}
                        </Text>
                      )}

                      {canMark && editing !== day.date && (
                        <View style={styles.row}>
                          {day.mark ? (
                            <Button label={`Change ${label}`} secondary onPress={() => openEditor(day)} />
                          ) : (
                            <>
                              <Button label={`Present ${label}`} onPress={() => void quick(day.date, 'present')} />
                              <Button label={`Absent ${label}`} secondary onPress={() => void quick(day.date, 'absent')} />
                              <Button label={`More ${label}`} secondary onPress={() => openEditor(day)} />
                            </>
                          )}
                        </View>
                      )}

                      {editing === day.date && (
                        <View style={styles.panel}>
                          <View style={styles.row}>
                            {ENTRY_STATUSES.map((s) => (
                              <Pressable
                                key={s}
                                accessibilityRole="button"
                                accessibilityLabel={STATUS_LABEL[s]}
                                accessibilityState={{ selected: status === s }}
                                onPress={() => setStatus(s)}
                                style={[styles.chip, status === s && styles.chipOn]}
                              >
                                <Text style={status === s ? styles.chipTextOn : styles.chipText}>{STATUS_LABEL[s]}</Text>
                              </Pressable>
                            ))}
                          </View>
                          <TextInput
                            accessibilityLabel="Overtime hours"
                            style={styles.input}
                            value={overtime}
                            onChangeText={setOvertime}
                            keyboardType="decimal-pad"
                            placeholder="Overtime hours (0 to 8)"
                          />
                          <TextInput
                            accessibilityLabel="Note"
                            style={[styles.input, styles.tall]}
                            value={note}
                            onChangeText={setNote}
                            maxLength={500}
                            multiline
                            placeholder="Note (optional)"
                          />
                          <Button label="Save" onPress={() => void saveDay(day.date, () => cleanMark({ status, overtime, note }))} />
                          <Button label="Cancel" secondary onPress={closeEditor} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const toneStyle = {
  wait: { color: tone.wait },
  ok: { color: tone.ok },
  attention: { color: tone.attention },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  line: { fontSize: 16, color: colors.ink },
  error: { fontSize: 16, color: colors.redDeep },
  name: { fontSize: 18, fontWeight: '500' },
  status: { fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderWidth: 1, borderColor: colors.hair, borderRadius: radius.md, padding: 12, gap: 8, backgroundColor: colors.paper },
  panel: { gap: 12 },
  input: { borderWidth: 1, borderColor: colors.fieldLine, borderRadius: radius.sm, padding: 10, fontSize: 16, backgroundColor: colors.paper },
  tall: { minHeight: 70, textAlignVertical: 'top' },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 15 },
  chipTextOn: { color: colors.white, fontSize: 15 },
});
