// Record material movements at one site, with no signal needed. Owner: Materials (Nikhil).
// Issue #82, ADR-015. Every save goes to the outbox first, under the signed-in user. The
// balance shown is an estimate (the server balance at the last pull plus what this user
// has recorded since), and says so. "On the server" appears only once the server has
// accepted an entry (ADR-009). Below zero is a warning and never a refusal.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DeviceDb } from '../db/device-db';
import { KIND_LABELS, MATERIAL_KINDS, type MaterialKind } from '../materials/kinds';
import {
  formatMilli,
  MOVEMENT_MESSAGES,
  MovementError,
  movementStatusText,
  parseQuantity,
  type MovementTone,
} from '../materials/movement';
import { loadSiteMaterials, saveMovement, type SiteMaterial, type SiteMaterials } from '../materials/movement-store';
import { istDate, readSites, type MirrorSite } from '../sync/pull';
import { ageText } from '../sync/status-text';

export interface SiteMaterialsScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user: their movements and their copy of the site only. */
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
  | { kind: 'ready'; site: MirrorSite; data: SiteMaterials };

interface Form {
  materialId: string;
  kind: MaterialKind | null;
  quantity: string;
  reason: string;
  occurredOn: string;
}

// A fixed sentence per failure, never the error's own text (it can name files).
function errorText(error: unknown): string {
  if (error instanceof MovementError) return MOVEMENT_MESSAGES[error.code];
  return 'Could not save on this phone. Try again.';
}

const STATE_LABEL = { negative: 'Below zero', low: 'Low stock', ok: null } as const;

/** Whether this entry, on its own, takes the estimate below zero. */
function takesBelowZero(material: SiteMaterial, form: Form): boolean {
  if (form.kind === null) return false;
  const parsed = parseQuantity(form.quantity, form.kind);
  if (!parsed.ok) return false;
  const delta = form.kind === 'usage' ? -parsed.milli : parsed.milli;
  return delta < 0 && material.estimateMilli + delta < 0;
}

export function SiteMaterialsScreen({ openDb, userId, siteId, now = () => new Date(), pollMs = 3000 }: SiteMaterialsScreenProps) {
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [form, setForm] = useState<Form | null>(null);
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
        if (alive.current) setLoad({ kind: 'failed' });
      },
    );
  }, [openDb]);

  const refresh = useCallback(async () => {
    if (!db) return;
    try {
      const site = (await readSites(db, userId)).find((s) => s.id === siteId);
      const data = site ? await loadSiteMaterials(db, userId, siteId) : null;
      if (!alive.current) return;
      const read = JSON.stringify([site ?? null, data]);
      if (read === snapshot.current) return;
      snapshot.current = read;
      setLoad(site && data ? { kind: 'ready', site, data } : { kind: 'missing' });
    } catch {
      snapshot.current = '';
      if (alive.current) setLoad({ kind: 'failed' });
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

  const data = load.kind === 'ready' ? load.data : null;
  const selected = form && data ? (data.materials.find((m) => m.id === form.materialId) ?? null) : null;

  function open(material: SiteMaterial) {
    setMessage(null);
    setForm({ materialId: material.id, kind: null, quantity: '', reason: '', occurredOn: istDate(now().toISOString()) });
  }

  function close() {
    setMessage(null);
    setForm(null);
  }

  // One tap at a time: a second tap while the first is still saving would write a second record.
  async function save() {
    if (busy.current || !db || !form) return;
    busy.current = true;
    try {
      if (form.kind === null) throw new MovementError('kind_invalid');
      await saveMovement(
        db,
        userId,
        { materialId: form.materialId, kind: form.kind, quantity: form.quantity, reason: form.reason, occurredOn: form.occurredOn },
        now(),
      );
      if (!alive.current) return;
      setMessage(null);
      setForm(null);
      await refresh();
    } catch (error) {
      if (alive.current) setMessage(errorText(error));
    } finally {
      busy.current = false;
    }
  }

  const patch = (change: Partial<Form>) => setForm((f) => (f ? { ...f, ...change } : f));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {load.kind === 'loading' && <Text style={styles.line}>Loading…</Text>}
        {load.kind === 'failed' && <Text style={styles.error}>Could not read the materials on this phone.</Text>}
        {load.kind === 'missing' && <Text style={styles.line}>This site is not on this phone.</Text>}

        {load.kind === 'ready' && data && (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {load.site.name}
            </Text>
            {data.serverAsOf !== null && (
              <Text style={styles.sub}>
                {`Server balances updated ${ageText(data.serverAsOf, now())}. Estimates add what you recorded on this phone.`}
              </Text>
            )}

            {data.materials.length === 0 && (
              <Text style={styles.line}>No materials on this site yet. Ask a manager to add them, then connect once.</Text>
            )}

            {data.materials.map((m) => {
              const label = STATE_LABEL[m.state];
              return (
                <View key={m.id} style={styles.material}>
                  <Text style={styles.materialName}>{m.name}</Text>
                  <Text style={styles.estimate}>{`Estimate: ${formatMilli(m.estimateMilli)} ${m.unit}`}</Text>
                  <Text style={styles.sub}>{`Server balance: ${formatMilli(m.serverBalanceMilli)} ${m.unit}`}</Text>
                  {m.unsent > 0 && <Text style={styles.sub}>{`${m.unsent} not sent yet`}</Text>}
                  {label !== null && <Text style={styles.error}>{label}</Text>}
                  {form === null && (
                    <Button label={`Record for ${m.name}`} onPress={() => open(m)} />
                  )}
                </View>
              );
            })}

            {form && selected && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{`Record for ${selected.name}`}</Text>
                <View style={styles.kinds}>
                  {MATERIAL_KINDS.map((kind) => (
                    <Button
                      key={kind}
                      label={KIND_LABELS[kind]}
                      secondary={form.kind !== kind}
                      selected={form.kind === kind}
                      onPress={() => patch({ kind })}
                    />
                  ))}
                </View>
                <Text style={styles.sub}>{`Quantity in ${selected.unit}`}</Text>
                <TextInput
                  accessibilityLabel="Quantity"
                  style={styles.field}
                  value={form.quantity}
                  onChangeText={(quantity) => patch({ quantity })}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                />
                <Text style={styles.sub}>
                  {form.kind === 'adjustment' ? 'Reason (required for an adjustment)' : 'Reason (optional)'}
                </Text>
                <TextInput
                  accessibilityLabel="Reason"
                  style={[styles.field, styles.multiline]}
                  value={form.reason}
                  onChangeText={(reason) => patch({ reason })}
                  maxLength={500}
                  multiline
                />
                <Text style={styles.sub}>Date (YYYY-MM-DD)</Text>
                <TextInput
                  accessibilityLabel="Date"
                  style={styles.field}
                  value={form.occurredOn}
                  onChangeText={(occurredOn) => patch({ occurredOn })}
                  autoCorrect={false}
                />
                {takesBelowZero(selected, form) && (
                  <Text style={styles.warning} accessibilityLiveRegion="polite">
                    This would take the estimate below zero. You can still save it.
                  </Text>
                )}
                {message && (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {message}
                  </Text>
                )}
                <Button label="Save" onPress={() => void save()} />
                <Button label="Cancel" secondary onPress={close} />
              </View>
            )}

            {data.recent.length > 0 && (
              <Text style={styles.heading} accessibilityRole="header">
                Recent entries
              </Text>
            )}
            {data.recent.map((r) => {
              const status = movementStatusText(r.status, r.reason);
              return (
                <View key={r.recordId} style={styles.entry}>
                  <Text style={styles.entryLine}>
                    {`${KIND_LABELS[r.movement.kind]} ${formatMilli(r.movement.quantityMilli)} ${r.unit} · ${r.materialName} · ${r.movement.occurredOn}`}
                  </Text>
                  {r.movement.reason !== null && <Text style={styles.sub}>{`Reason: ${r.movement.reason}`}</Text>}
                  <Text style={[styles.status, toneStyle[status.tone]]} accessibilityLiveRegion="polite">
                    {status.text}
                  </Text>
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
  selected,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={[styles.button, secondary && styles.buttonSecondary]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const toneStyle: Record<MovementTone, { color: string }> = {
  wait: { color: '#555' },
  ok: { color: '#1b6e2d' },
  attention: { color: '#b00020' },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  sub: { fontSize: 14, color: '#555' },
  line: { fontSize: 16, color: '#222' },
  error: { fontSize: 16, color: '#b00020' },
  warning: { fontSize: 16, color: '#8a5a00' },
  material: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, gap: 6 },
  materialName: { fontSize: 18, fontWeight: '600' },
  estimate: { fontSize: 16, fontWeight: '500' },
  panel: { gap: 10, borderWidth: 1, borderColor: '#111', borderRadius: 8, padding: 12 },
  panelTitle: { fontSize: 18, fontWeight: '600' },
  kinds: { gap: 8 },
  field: { borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10, minHeight: 44, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  entry: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, gap: 4 },
  entryLine: { fontSize: 16, fontWeight: '500' },
  status: { fontSize: 14 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  buttonText: { color: '#fff', fontSize: 16 },
  buttonTextSecondary: { color: '#111' },
});
