// File the day's report for one site, with no signal needed. Owner: Daily Reporting
// (Anuradha). Issue #81, ADR-036. Every save goes to the outbox first, under the
// signed-in user; the screen reads the report back from there and says "Submitted"
// only once the server has accepted the submit (ADR-009). The database is the
// boundary (ADR-013): the phone's checks only say what is wrong sooner.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DeviceDb } from '../db/device-db';
import {
  dayLabel,
  fieldsOf,
  isFlagged,
  needsReason,
  reportDay,
  reportErrorText,
  reportStatusText,
  type ReportFields,
  type ReportStatus,
  type ReportTone,
} from '../reports/report';
import { findReport, saveReport, type StoredReport } from '../reports/report-store';
import { istDate, readSites, type MirrorSite } from '../sync/pull';

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
}

type Load =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'missing' }
  | { kind: 'ready'; site: MirrorSite; stored: StoredReport | null };

const toneStyle: Record<ReportTone, { color: string }> = {
  wait: { color: '#8a5a00' },
  ok: { color: '#1b6e20' },
  attention: { color: '#b00020' },
};

export function DailyReportScreen({
  openDb,
  userId,
  siteId,
  date,
  now = () => new Date(),
  pollMs = 3000,
}: DailyReportScreenProps) {
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [form, setForm] = useState<ReportFields>(fieldsOf(null));
  const [reasonText, setReasonText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);
  // The form is filled from the phone once; a poll only updates the status line,
  // so it never overwrites what the supervisor is typing.
  const filled = useRef(false);
  const snapshot = useRef('');
  const busy = useRef(false);

  const today = istDate(now().toISOString());
  const day = reportDay(date, today);

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
      const site = (await readSites(db, userId)).find((s) => s.id === siteId.toLowerCase());
      const stored = site ? await findReport(db, userId, site.id, day) : null;
      if (!alive.current) return;
      const read = JSON.stringify([site ?? null, stored]);
      if (read === snapshot.current) return;
      snapshot.current = read;
      if (!site) {
        setLoad({ kind: 'missing' });
        return;
      }
      if (!filled.current) {
        filled.current = true;
        setForm(fieldsOf(stored?.report ?? null));
      }
      setLoad({ kind: 'ready', site, stored });
    } catch {
      snapshot.current = '';
      // A fixed sentence: the error can name files (ADR-029).
      if (alive.current) setLoad({ kind: 'failed' });
    }
  }, [db, userId, siteId, day]);

  useEffect(() => {
    // First read as soon as the database is open, then on a slow tick so a verdict shows.
    const first = setTimeout(() => void refresh(), 0);
    const tick = db && pollMs > 0 ? setInterval(() => void refresh(), pollMs) : undefined;
    return () => {
      clearTimeout(first);
      if (tick) clearInterval(tick);
    };
  }, [db, refresh, pollMs]);

  const set = <K extends keyof ReportFields>(key: K) => (value: ReportFields[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // One tap at a time: a second tap while the first is saving would race it.
  async function save(status: ReportStatus) {
    if (busy.current || !db || load.kind !== 'ready') return;
    busy.current = true;
    try {
      await saveReport(db, userId, load.site, day, form, status, { reason: reasonText }, now());
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

  const title = day === today ? `Report for today, ${dayLabel(day)}` : `Report for ${dayLabel(day)}`;

  if (load.kind !== 'ready') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          Daily report
        </Text>
        {load.kind === 'loading' && <Text style={styles.line}>Loading…</Text>}
        {load.kind === 'failed' && <Text style={styles.error}>Could not read the records on this phone.</Text>}
        {load.kind === 'missing' && (
          <Text style={styles.line}>This site is not on this phone. Connect once to refresh your sites.</Text>
        )}
      </SafeAreaView>
    );
  }

  const { site, stored } = load;
  const reviewed = stored?.status === 'conflict' && stored.reason === 'reviewed';
  const editing = needsReason(stored?.report ?? null);
  const editable = !reviewed;
  const status = stored ? reportStatusText(stored.report.status, stored.status, stored.reason) : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">
          {site.name}
        </Text>
        <Text style={styles.line}>{title}</Text>
        {site.orgId === null && <Text style={styles.error}>Connect once to refresh your sites, then try again.</Text>}
        {status && (
          <Text style={[styles.status, toneStyle[status.tone]]} accessibilityLiveRegion="polite">
            {status.text}
          </Text>
        )}

        <Field label="Headcount">
          <TextInput
            accessibilityLabel="Headcount"
            value={form.headcount}
            onChangeText={set('headcount')}
            keyboardType="number-pad"
            editable={editable}
            style={styles.input}
          />
        </Field>
        <Field label="Work done">
          <TextInput
            accessibilityLabel="Work done"
            value={form.workDone}
            onChangeText={set('workDone')}
            multiline
            editable={editable}
            style={[styles.input, styles.multiline]}
          />
        </Field>
        <Field label="Blockers">
          <TextInput
            accessibilityLabel="Blockers"
            value={form.blockers}
            onChangeText={set('blockers')}
            multiline
            editable={editable}
            style={[styles.input, styles.multiline]}
          />
        </Field>
        <Toggle label="Serious blocker" value={form.seriousBlocker} onChange={set('seriousBlocker')} disabled={!editable} />
        <Toggle label="Safety incident" value={form.safetyIncident} onChange={set('safetyIncident')} disabled={!editable} />
        <Field label="Plan for tomorrow">
          <TextInput
            accessibilityLabel="Plan for tomorrow"
            value={form.nextDayPlan}
            onChangeText={set('nextDayPlan')}
            multiline
            editable={editable}
            style={[styles.input, styles.multiline]}
          />
        </Field>

        {isFlagged(form) && (
          <View style={styles.flag} accessibilityLiveRegion="polite">
            <Text style={styles.flagText}>
              {`${[form.seriousBlocker && 'Serious blocker', form.safetyIncident && 'Safety incident']
                .filter(Boolean)
                .join(' and ')}: this report will be flagged to your managers.`}
            </Text>
          </View>
        )}

        {editing && editable && (
          <Field label="Reason for the change">
            <TextInput
              accessibilityLabel="Reason for the change"
              value={reasonText}
              onChangeText={setReasonText}
              multiline
              style={[styles.input, styles.multiline]}
            />
          </Field>
        )}

        {message && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {message}
          </Text>
        )}

        {editable && (
          <View style={styles.buttons}>
            {!editing && <Button label="Save draft" secondary onPress={() => void save('draft')} />}
            <Button label={editing ? 'Send changes' : 'Submit'} onPress={() => void save('submitted')} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Toggle({
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
    <View style={styles.toggle}>
      <Text style={styles.label}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

function Button({ label, onPress, secondary }: { label: string; onPress: () => void; secondary?: boolean }) {
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '600' },
  line: { fontSize: 16, color: '#333' },
  status: { fontSize: 16, fontWeight: '600' },
  error: { fontSize: 16, color: '#b00020' },
  field: { gap: 4 },
  label: { fontSize: 16, color: '#111' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#888', borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  multiline: { minHeight: 88, paddingVertical: 8, textAlignVertical: 'top' },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flag: { borderWidth: 2, borderColor: '#b00020', borderRadius: 8, padding: 12, backgroundColor: '#fdecee' },
  flagText: { fontSize: 16, color: '#b00020', fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  button: {
    minHeight: 44,
    minWidth: 140,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  buttonText: { color: '#fff', fontSize: 16 },
  buttonTextSecondary: { color: '#111' },
});
