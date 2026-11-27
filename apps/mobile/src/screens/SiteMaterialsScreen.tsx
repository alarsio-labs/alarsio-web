// Record material movements at one site, with no signal needed. Owner: Materials (Nikhil).
// Issue #82, ADR-015. Every save goes to the outbox first, under the signed-in user. The
// balance shown is an estimate (the server balance at the last pull plus what this user
// has recorded since), and says so. "On the server" appears only once the server has
// accepted an entry (ADR-009). Below zero is a warning and never a refusal.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { DeviceDb } from '../db/device-db';
import { kindLabel, MATERIAL_KINDS, type MaterialKind } from '../materials/kinds';
import {
  formatMilli,
  MovementError,
  movementErrorText,
  movementStatusText,
  parseQuantity,
} from '../materials/movement';
import { loadSiteMaterials, saveMovement, type SiteMaterial, type SiteMaterials } from '../materials/movement-store';
import { istDate, readSites, type MirrorSite } from '../sync/pull';
import { ageText } from '../sync/status-text';
import { colors, space, tone } from '../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { StatusBadge } from '../ui/StatusBadge';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { DatePickerField, type OpenDatePicker } from './DatePickerField';
import { LoadFailed } from './LoadFailed';
import { ScreenTitle } from './ScreenTitle';

export interface SiteMaterialsScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user: their movements and their copy of the site only. */
  userId: string;
  siteId: string;
  /** The phone's clock. Tests pass their own. */
  now?: () => Date;
  /** Opens the date picker. Tests pass a fake; the default is the phone's own picker. */
  openDatePicker?: OpenDatePicker;
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

/** Whether this entry, on its own, takes the estimate below zero. */
function takesBelowZero(material: SiteMaterial, form: Form): boolean {
  if (form.kind === null) return false;
  const parsed = parseQuantity(form.quantity, form.kind);
  if (!parsed.ok) return false;
  const delta = form.kind === 'usage' ? -parsed.milli : parsed.milli;
  return delta < 0 && material.estimateMilli + delta < 0;
}

export function SiteMaterialsScreen({ openDb, userId, siteId, now = () => new Date(), pollMs = 3000, openDatePicker }: SiteMaterialsScreenProps) {
  const { t } = useTranslation();
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

  const data = load.kind === 'ready' ? load.data : null;
  const selected = form && data ? (data.materials.find((m) => m.id === form.materialId) ?? null) : null;

  // A fixed sentence per failure, never the error's own text (it can name files).
  const errorText = (error: unknown) =>
    error instanceof MovementError ? movementErrorText(error.code) : t('siteMaterials.error.generic');

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
    <Screen>
      {load.kind === 'loading' && <Text>{t('common.loading')}</Text>}
      {load.kind === 'failed' && <LoadFailed message={t('siteMaterials.loadFailed')} onRetry={retry} />}
      {load.kind === 'missing' && <EmptyState title={t('siteMaterials.missing')} />}

      {load.kind === 'ready' && data && (
        <>
          <ScreenTitle screen="site_materials" siteName={load.site.name} />
          <Text variant="title" bold accessibilityRole="header">
            {load.site.name}
          </Text>
          {data.serverAsOf !== null && (
            <Text variant="small" color={colors.muted}>
              {t('siteMaterials.serverAsOf', { age: ageText(data.serverAsOf, now()) })}
            </Text>
          )}

          {data.materials.length === 0 && (
            <EmptyState title={t('siteMaterials.empty')} hint={t('siteMaterials.emptyHint')} />
          )}

          {data.materials.map((m) => (
            <Card key={m.id}>
              <Text variant="heading" bold>
                {m.name}
              </Text>
              <Text bold>{t('siteMaterials.estimate', { value: formatMilli(m.estimateMilli), unit: m.unit })}</Text>
              <Text variant="small" color={colors.muted}>
                {t('siteMaterials.serverBalance', { value: formatMilli(m.serverBalanceMilli), unit: m.unit })}
              </Text>
              {m.unsent > 0 && (
                <Text variant="small" color={colors.muted}>
                  {t('siteMaterials.unsent', { count: m.unsent })}
                </Text>
              )}
              {m.state === 'negative' && <StatusBadge tone="attention" label={t('siteMaterials.belowZero')} />}
              {m.state === 'low' && <StatusBadge tone="wait" label={t('siteMaterials.lowStock')} />}
              {form === null && (
                <Button kind="secondary" label={t('siteMaterials.record', { name: m.name })} onPress={() => open(m)} />
              )}
            </Card>
          ))}

          {form && selected && (
            <Card style={styles.panel}>
              <Text variant="heading" bold>
                {t('siteMaterials.record', { name: selected.name })}
              </Text>
              <View style={styles.kinds}>
                {MATERIAL_KINDS.map((kind) => (
                  <Button
                    key={kind}
                    label={kindLabel(kind)}
                    kind={form.kind === kind ? 'primary' : 'secondary'}
                    icon={form.kind === kind ? 'ok' : undefined}
                    onPress={() => patch({ kind })}
                  />
                ))}
              </View>
              <TextField
                label={t('siteMaterials.quantityIn', { unit: selected.unit })}
                accessibilityLabel={t('siteMaterials.quantity')}
                value={form.quantity}
                onChangeText={(quantity) => patch({ quantity })}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
              <TextField
                label={form.kind === 'adjustment' ? t('siteMaterials.reasonRequired') : t('siteMaterials.reasonOptional')}
                accessibilityLabel={t('siteMaterials.reason')}
                value={form.reason}
                onChangeText={(reason) => patch({ reason })}
                maxLength={500}
                multiline
              />
              <Text variant="small" bold color={colors.muted}>
                {t('siteMaterials.date')}
              </Text>
              <DatePickerField
                value={form.occurredOn}
                max={istDate(now().toISOString())}
                onChange={(occurredOn) => patch({ occurredOn })}
                openPicker={openDatePicker}
              />
              {takesBelowZero(selected, form) && (
                <View accessibilityLiveRegion="polite">
                  <StatusBadge tone="wait" label={t('siteMaterials.warnBelowZero')} />
                </View>
              )}
              {message && (
                <Text color={tone.attention.text} accessibilityLiveRegion="polite">
                  {message}
                </Text>
              )}
              <Button label={t('siteMaterials.save')} onPress={() => void save()} />
              <Button kind="secondary" label={t('siteMaterials.cancel')} onPress={close} />
            </Card>
          )}

          {data.recent.length > 0 && (
            <Text variant="heading" bold accessibilityRole="header" style={styles.heading}>
              {t('siteMaterials.recent')}
            </Text>
          )}
          {data.recent.map((r) => {
            const status = movementStatusText(r.status, r.reason);
            return (
              <Card key={r.recordId}>
                <Text bold>
                  {t('siteMaterials.entry', {
                    kind: kindLabel(r.movement.kind),
                    quantity: formatMilli(r.movement.quantityMilli),
                    unit: r.unit,
                    material: r.materialName,
                    date: r.movement.occurredOn,
                  })}
                </Text>
                {r.movement.reason !== null && (
                  <Text variant="small" color={colors.muted}>
                    {t('siteMaterials.entryReason', { reason: r.movement.reason })}
                  </Text>
                )}
                <View accessibilityLiveRegion="polite">
                  <StatusBadge tone={status.tone} label={status.text} />
                </View>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md },
  kinds: { gap: space.sm },
  heading: { marginTop: space.sm },
});
