// The day register at one site: mark everyone present in one tap, mark or change one worker,
// or propose a correction on an approved day, all with no signal. Owner: Attendance
// (Manish). Issue #79, ADR-048. Every save goes to the outbox first, under the signed-in
// user; the screen reads it back and says "On the server" only once the server accepted it.
// A day the server approved is read-only, learned from the phone's copy of the approved
// days or from a `locked` answer (ADR-049).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { dayLabel, markParts } from '../attendance/labels';
import {
  cleanMark,
  entryStatusText,
  RegisterError,
  type EntryStatus,
  type Mark,
  type RegisterErrorCode,
} from '../attendance/register';
import {
  markAllPresent,
  proposeCorrection,
  readRegister,
  saveMark,
  type Register,
  type RegisterRow,
} from '../attendance/register-store';
import type { DeviceDb } from '../db/device-db';
import i18n from '../i18n';
import { istDate, readSites, type MirrorSite } from '../sync/pull';
import { colors, minTarget, radius, space, tone } from '../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { StatusBadge } from '../ui/StatusBadge';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { LoadFailed } from './LoadFailed';
import { MarkFields } from './MarkFields';
import { ScreenTitle } from './ScreenTitle';

export interface DayRegisterScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user: their entries and their copy of the roster only. */
  userId: string;
  siteId: string;
  /** The phone's clock. Tests pass their own. */
  now?: () => Date;
  /** How often the screen re-reads the outbox to show a verdict. 0 turns it off. */
  pollMs?: number;
}

/** The roster mirror reaches back about a week (ADR-023), so the register does too. */
const DAYS_BACK = 7;

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'missing' } | { kind: 'ready'; site: MirrorSite; register: Register };

type Editing = { workerId: string; correction: boolean };

// One tap: Present, Half day, Absent. Selected is solid in the status colour; colour is never the only signal (the letter and the label).
const QUICK = [
  { status: 'present', short: 'register.shortPresent', label: 'register.markPresent', tone: 'ok' },
  { status: 'half_day', short: 'register.shortHalf', label: 'register.markHalf', tone: 'wait' },
  { status: 'absent', short: 'register.shortAbsent', label: 'register.markAbsent', tone: 'attention' },
] as const;

function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
}

// A fixed sentence per failure, never the error's own text.
const ERRORS = {
  status: 'register.error.status',
  overtime: 'register.error.overtime',
  overtime_needs_work: 'register.error.overtimeNeedsWork',
  note: 'register.error.note',
  reason_required: 'register.error.reasonRequired',
  reason_too_long: 'register.error.reasonTooLong',
  no_org: 'attendance.error.noOrg',
  locked: 'register.error.locked',
  not_locked: 'register.error.notLocked',
  no_change: 'register.error.noChange',
  no_entry: 'register.error.cannotChange',
  not_on_roster: 'register.error.cannotChange',
  bad_date: 'register.error.cannotChange',
} as const satisfies Record<RegisterErrorCode, string>;

export function errorText(error: unknown): string {
  return i18n.t(error instanceof RegisterError ? ERRORS[error.code] : 'attendance.error.saveFailed');
}

const describe = (mark: Mark): string => [...markParts(mark), ...(mark.note ? [mark.note] : [])].join(' · ');

/** What the register says about a worker today, whoever said it: a correction, the phone's entry or the approved day. */
const statusOf = (row: RegisterRow): EntryStatus | null =>
  row.correction?.mark.status ?? row.entry?.mark.status ?? row.approved?.status ?? null;

export function DayRegisterScreen({ openDb, userId, siteId, now = () => new Date(), pollMs = 3000 }: DayRegisterScreenProps) {
  const { t } = useTranslation();
  const today = istDate(now().toISOString());
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [status, setStatus] = useState<EntryStatus>('present');
  const [overtime, setOvertime] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
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
      const register = site ? await readRegister(db, userId, siteId, date) : null;
      if (!alive.current) return;
      const read = JSON.stringify([site ?? null, register]);
      if (read === snapshot.current) return;
      snapshot.current = read;
      setLoad(site && register ? { kind: 'ready', site, register } : { kind: 'missing' });
    } catch {
      snapshot.current = '';
      if (alive.current) setLoad({ kind: 'failed' });
    }
  }, [db, userId, siteId, date]);

  // Try again: open the database again if it failed to open, and read the records again.
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
    setReason('');
    setMessage(null);
  }

  function openEditor(row: RegisterRow, correction: boolean) {
    const current: Mark | null =
      row.correction?.mark ??
      row.entry?.mark ??
      (row.approved ? { status: row.approved.status, overtimeHours: row.approved.overtimeHours, note: null } : null);
    setStatus(current?.status ?? 'present');
    setOvertime(current && current.overtimeHours > 0 ? String(current.overtimeHours) : '');
    setNote(current?.note ?? '');
    setReason('');
    setMessage(null);
    setEditing({ workerId: row.worker.workerId, correction });
  }

  const ready = load.kind === 'ready' ? load : null;
  const site = ready?.site ?? null;

  const markAll = () =>
    once(async () => {
      if (!db || !site) return;
      await markAllPresent(db, userId, site, date, now());
      setMessage(null);
      await refresh();
    });

  // A tap on P, ½ or A keeps the overtime and note already saved, unless the status cannot carry overtime.
  const quickMark = (row: RegisterRow, next: EntryStatus) =>
    once(async () => {
      if (!db || !site) return;
      const kept = row.entry?.mark;
      const hours = kept && next !== 'absent' && kept.overtimeHours > 0 ? String(kept.overtimeHours) : '';
      await saveMark(db, userId, site, date, row.worker.workerId, cleanMark({ status: next, overtime: hours, note: kept?.note ?? '' }), now());
      setMessage(null);
      await refresh();
    });

  const save = (e: Editing) =>
    once(async () => {
      if (!db || !site) return;
      const mark = cleanMark({ status, overtime, note });
      if (e.correction) await proposeCorrection(db, userId, site, date, e.workerId, mark, reason, now());
      else await saveMark(db, userId, site, date, e.workerId, mark, now());
      closeEditor();
      await refresh();
    });

  const register = ready?.register ?? null;
  const unmarked = register ? register.rows.filter((r) => r.entry === null).length : 0;
  const dayStatus = register?.day ? entryStatusText(register.day.status, register.day.verdictReason) : null;
  const statuses = register ? register.rows.map(statusOf) : [];
  const counters = [
    { label: t('register.countPresent'), count: statuses.filter((s) => s === 'present' || s === 'half_day').length, tone: 'ok' },
    { label: t('register.countAbsent'), count: statuses.filter((s) => s === 'absent' || s === 'leave').length, tone: 'attention' },
    { label: t('register.countLeft'), count: statuses.filter((s) => s === null).length, tone: 'neutral' },
  ] as const;

  return (
    <Screen>
      {load.kind === 'loading' && <Text color={colors.muted}>{t('common.loading')}</Text>}
      {load.kind === 'failed' && <LoadFailed message={t('register.readFailed')} onRetry={retry} />}
      {load.kind === 'missing' && <Text>{t('attendance.siteMissing')}</Text>}

      {site && register && (
        <>
          <ScreenTitle screen="day_register" siteName={site.name} />
          <Text bold>{t('register.forDay', { day: date === today ? t('register.today') : dayLabel(date) })}</Text>

          <View style={styles.row}>
            <Button
              label={t('register.earlierDay')}
              kind="secondary"
              style={styles.grow}
              disabled={date <= shiftDay(today, -DAYS_BACK)}
              onPress={() => {
                closeEditor();
                setDate(shiftDay(date, -1));
              }}
            />
            <Button
              label={t('register.laterDay')}
              kind="secondary"
              style={styles.grow}
              disabled={date >= today}
              onPress={() => {
                closeEditor();
                setDate(shiftDay(date, 1));
              }}
            />
          </View>

          <View style={styles.row}>
            {counters.map((c) => (
              <Card key={c.label} accessible accessibilityLabel={`${c.label} ${c.count}`} style={styles.counter}>
                <Text variant="counter" bold color={tone[c.tone].text}>
                  {c.count}
                </Text>
                <Text variant="small" color={colors.muted}>
                  {c.label}
                </Text>
              </Card>
            ))}
          </View>

          {site.orgId === null && <Text color={tone.attention.text}>{t('register.connectToMark')}</Text>}

          {register.locked && (
            <Card style={styles.notice}>
              <Text>{t('register.locked')}</Text>
            </Card>
          )}
          {dayStatus && dayStatus.tone === 'attention' && (
            <StatusBadge tone="attention" label={t('register.dayStatus', { text: dayStatus.text })} />
          )}

          {message && (
            <Text color={tone.attention.text} accessibilityLiveRegion="polite">
              {message}
            </Text>
          )}

          {!register.locked && site.orgId !== null && unmarked > 0 && !editing && (
            <Button label={t('register.markAll', { count: unmarked })} onPress={() => void markAll()} />
          )}
          {register.rows.length === 0 && <Text>{t('register.noWorkers')}</Text>}

          {register.rows.map((row) => {
            const id = row.worker.workerId;
            const shown = row.correction ? row.correction.mark : row.entry?.mark ?? null;
            const text = row.correction
              ? entryStatusText(row.correction.status, row.correction.verdictReason)
              : row.entry
                ? entryStatusText(row.entry.status, row.entry.verdictReason)
                : null;
            const open = editing?.workerId === id ? editing : null;
            const canMark = !open && !editing && site.orgId !== null && !register.locked;
            const line = shown
              ? row.correction
                ? t('register.correction', { text: describe(shown) })
                : describe(shown)
              : row.approved
                ? t('register.approved', { text: describe({ ...row.approved, note: null }) })
                : t('register.notMarked');
            return (
              <Card key={id}>
                <Text bold>{row.worker.name}</Text>
                <Text variant="small" color={colors.muted}>{`${row.worker.code} · ${row.worker.trade}`}</Text>
                <Text>{line}</Text>
                {text && (
                  <View accessibilityLiveRegion="polite">
                    <StatusBadge tone={text.tone} label={text.text} />
                  </View>
                )}

                {canMark && (
                  <View style={styles.row}>
                    {QUICK.map((q) => {
                      const on = shown?.status === q.status;
                      const color = tone[q.tone].text;
                      return (
                        <Pressable
                          key={q.status}
                          accessibilityRole="button"
                          accessibilityLabel={t(q.label, { name: row.worker.name })}
                          accessibilityState={{ selected: on }}
                          onPress={() => void quickMark(row, q.status)}
                          style={[styles.quick, { borderColor: on ? color : colors.field, backgroundColor: on ? color : colors.white }]}
                        >
                          <Text bold color={on ? colors.white : colors.text}>
                            {t(q.short)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Button
                      label={t('register.change')}
                      accessibilityLabel={t('register.changeLabel', { name: row.worker.name })}
                      kind="secondary"
                      style={styles.change}
                      onPress={() => openEditor(row, false)}
                    />
                  </View>
                )}
                {!open && !editing && site.orgId !== null && register.locked && (row.entry || row.approved) && (
                  <Button
                    label={t('register.propose')}
                    accessibilityLabel={t('register.proposeLabel', { name: row.worker.name })}
                    kind="secondary"
                    onPress={() => openEditor(row, true)}
                  />
                )}

                {open && (
                  <View style={styles.panel}>
                    <MarkFields
                      status={status}
                      onStatus={setStatus}
                      overtime={overtime}
                      onOvertime={setOvertime}
                      note={note}
                      onNote={setNote}
                    />
                    {open.correction && (
                      <TextField
                        label={t('register.reasonLabel')}
                        placeholder={t('register.reasonPlaceholder')}
                        value={reason}
                        onChangeText={setReason}
                        maxLength={500}
                        multiline
                      />
                    )}
                    <Button label={open.correction ? t('register.propose') : t('fields.save')} onPress={() => void save(open)} />
                    <Button label={t('fields.cancel')} kind="secondary" onPress={closeEditor} />
                  </View>
                )}
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  grow: { flex: 1 },
  counter: { flex: 1, alignItems: 'center', gap: 0, padding: space.md },
  notice: { backgroundColor: tone.wait.tint },
  quick: {
    flex: 1,
    minWidth: minTarget,
    minHeight: minTarget,
    borderWidth: 1.5,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  change: { flex: 1.6, minWidth: 96, paddingHorizontal: space.sm },
  panel: { gap: space.md },
});
