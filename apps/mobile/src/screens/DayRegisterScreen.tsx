// The day register at one site: mark everyone present in one tap, change one worker,
// or propose a correction on an approved day, all with no signal. Owner: Attendance
// (Manish). Issue #79, ADR-048. Every save goes to the outbox first, under the signed-in
// user; the screen reads it back and says "On the server" only once the server accepted it.
// A day the server approved is read-only, learned from the phone's copy of the approved
// days or from a `locked` answer (ADR-049).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  cleanMark,
  ENTRY_STATUSES,
  entryStatusText,
  RegisterError,
  type EntryStatus,
  type Mark,
  type StatusTone,
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
import { istDate, readSites, type MirrorSite } from '../sync/pull';

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

const STATUS_LABEL: Record<EntryStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half day',
  leave: 'Leave',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''}`;

function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
}

// A fixed sentence per failure, never the error's own text.
function errorText(error: unknown): string {
  if (error instanceof RegisterError) {
    switch (error.code) {
      case 'status':
        return 'Choose present, absent, half day or leave.';
      case 'overtime':
        return 'Overtime is a number of hours from 0 to 8, with up to 2 decimals.';
      case 'overtime_needs_work':
        return 'Overtime can only be added for a present or half day.';
      case 'note':
        return 'Keep the note under 500 characters.';
      case 'reason_required':
        return 'Say why the entry should change.';
      case 'reason_too_long':
        return 'Keep the reason under 500 characters.';
      case 'no_org':
        return 'Connect once to refresh your sites, then try again.';
      case 'locked':
        return 'This day is approved. Propose a correction instead.';
      case 'not_locked':
        return 'This day is not known to be approved, so use Change.';
      case 'no_change':
        return 'That is what the server already has. Change something first.';
      case 'no_entry':
      case 'not_on_roster':
      case 'bad_date':
        return 'This worker cannot be changed on this day.';
    }
  }
  return 'Could not save on this phone. Try again.';
}

function describe(mark: Mark): string {
  const parts = [STATUS_LABEL[mark.status]];
  if (mark.overtimeHours > 0) parts.push(`${mark.overtimeHours} h overtime`);
  if (mark.note) parts.push(mark.note);
  return parts.join(' · ');
}

export function DayRegisterScreen({ openDb, userId, siteId, now = () => new Date(), pollMs = 3000 }: DayRegisterScreenProps) {
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

  useEffect(() => {
    openDb().then(
      (opened) => {
        if (alive.current) setDb(opened);
      },
      () => {
        if (alive.current) setLoad({ kind: 'failed' });
      },
    );
  }, [openDb]);

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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {load.kind === 'loading' && <Text style={styles.line}>Loading…</Text>}
        {load.kind === 'failed' && <Text style={styles.error}>Could not read the records on this phone.</Text>}
        {load.kind === 'missing' && <Text style={styles.line}>This site is not on this phone.</Text>}

        {site && register && (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {site.name}
            </Text>
            <Text style={styles.sub}>{`Attendance for ${date === today ? 'today' : dayLabel(date)}`}</Text>

            <View style={styles.row}>
              <Button
                label="Earlier day"
                secondary
                disabled={date <= shiftDay(today, -DAYS_BACK)}
                onPress={() => {
                  closeEditor();
                  setDate(shiftDay(date, -1));
                }}
              />
              <Button
                label="Later day"
                secondary
                disabled={date >= today}
                onPress={() => {
                  closeEditor();
                  setDate(shiftDay(date, 1));
                }}
              />
            </View>

            {site.orgId === null && <Text style={styles.error}>Connect once to refresh your sites, then mark attendance.</Text>}

            {register.locked && (
              <Text style={styles.error}>
                A manager approved this day. It is read-only here. To change a worker, propose a correction.
              </Text>
            )}
            {dayStatus && dayStatus.tone === 'attention' && (
              <Text style={[styles.status, toneStyle.attention]}>{`Day: ${dayStatus.text}`}</Text>
            )}

            {message && (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {message}
              </Text>
            )}

            {!register.locked && site.orgId !== null && unmarked > 0 && !editing && (
              <Button label={`Mark everyone present (${unmarked})`} onPress={() => void markAll()} />
            )}
            {register.rows.length === 0 && (
              <Text style={styles.line}>No workers are rostered at this site for this day on this phone.</Text>
            )}

            {register.rows.map((row) => {
              const id = row.worker.workerId;
              const shown = row.correction ? row.correction.mark : row.entry?.mark ?? null;
              const text = row.correction
                ? entryStatusText(row.correction.status, row.correction.verdictReason)
                : row.entry
                  ? entryStatusText(row.entry.status, row.entry.verdictReason)
                  : null;
              const open = editing?.workerId === id ? editing : null;
              return (
                <View key={id} style={styles.card}>
                  <Text style={styles.name}>{row.worker.name}</Text>
                  <Text style={styles.sub}>{`${row.worker.code} · ${row.worker.trade}`}</Text>
                  <Text style={styles.line}>
                    {shown
                      ? `${row.correction ? 'Correction: ' : ''}${describe(shown)}`
                      : row.approved
                        ? `Approved · ${describe({ ...row.approved, note: null })}`
                        : 'Not marked'}
                  </Text>
                  {text && (
                    <Text style={[styles.status, toneStyle[text.tone]]} accessibilityLiveRegion="polite">
                      {text.text}
                    </Text>
                  )}

                  {!open && !editing && site.orgId !== null && !register.locked && (
                    <Button label={`Change ${row.worker.name}`} secondary onPress={() => openEditor(row, false)} />
                  )}
                  {!open && !editing && site.orgId !== null && register.locked && (row.entry || row.approved) && (
                    <Button label={`Propose correction for ${row.worker.name}`} secondary onPress={() => openEditor(row, true)} />
                  )}

                  {open && (
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
                      {open.correction && (
                        <TextInput
                          accessibilityLabel="Reason for the correction"
                          style={[styles.input, styles.tall]}
                          value={reason}
                          onChangeText={setReason}
                          maxLength={500}
                          multiline
                          placeholder="Why should this change?"
                        />
                      )}
                      <Button label={open.correction ? 'Propose correction' : 'Save'} onPress={() => void save(open)} />
                      <Button label="Cancel" secondary onPress={closeEditor} />
                    </View>
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

function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled]}
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
  name: { fontSize: 18, fontWeight: '500' },
  status: { fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, gap: 8 },
  panel: { gap: 12 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10, fontSize: 16 },
  tall: { minHeight: 70, textAlignVertical: 'top' },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#111', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: '#111' },
  chipText: { color: '#111', fontSize: 15 },
  chipTextOn: { color: '#fff', fontSize: 15 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16 },
  buttonTextSecondary: { color: '#111' },
});
