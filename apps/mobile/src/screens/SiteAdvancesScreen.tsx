// Record worker advances at one site, with no signal needed. Owner: Offline Sync (Nikhil).
// Issue #239, ADR-054. Every save goes to the outbox first, under the signed-in user. The
// list shows what this user saved on this phone: the phone holds no copy of the server's
// advances, so it says so. "On the server" appears only once the server has accepted a
// record (ADR-009). No rate or pay is shown, only money paid out.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import {
  AdvanceError,
  advanceErrorText,
  advanceStatusText,
  formatRupees,
} from '../advances/advance';
import { loadSiteAdvances, reverseAdvance, saveAdvance, type SiteAdvance } from '../advances/advance-store';
import type { DeviceDb } from '../db/device-db';
import { istDate, readSites, readSiteWorkers, type MirrorSite, type RosterWorker } from '../sync/pull';
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

export interface SiteAdvancesScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user: their advances and their copy of the site only. */
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
  | { kind: 'ready'; site: MirrorSite; workers: RosterWorker[]; advances: SiteAdvance[] };

interface Form {
  workerId: string | null;
  amount: string;
  note: string;
  paidOn: string;
}

export function SiteAdvancesScreen({ openDb, userId, siteId, now = () => new Date(), pollMs = 3000, openDatePicker }: SiteAdvancesScreenProps) {
  const { t } = useTranslation();
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [form, setForm] = useState<Form | null>(null);
  // The advance whose cancellation is waiting for a second tap.
  const [confirming, setConfirming] = useState<string | null>(null);
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
      const [workers, advances] = site
        ? await Promise.all([readSiteWorkers(db, userId, siteId), loadSiteAdvances(db, userId, siteId)])
        : [[], []];
      if (!alive.current) return;
      const read = JSON.stringify([site ?? null, workers, advances]);
      if (read === snapshot.current) return;
      snapshot.current = read;
      setLoad(site ? { kind: 'ready', site, workers, advances } : { kind: 'missing' });
    } catch {
      snapshot.current = '';
      if (alive.current) setLoad({ kind: 'failed' });
    }
  }, [db, userId, siteId]);

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

  // A fixed sentence per failure, never the error's own text (it can name files).
  const errorText = (error: unknown) =>
    error instanceof AdvanceError ? advanceErrorText(error.code) : t('siteAdvances.error.generic');

  // One tap at a time: a second tap while the first is still saving would write a second record.
  async function guarded(work: () => Promise<void>) {
    if (busy.current || !db) return;
    busy.current = true;
    try {
      await work();
      if (!alive.current) return;
      setMessage(null);
      await refresh();
    } catch (error) {
      if (alive.current) setMessage(errorText(error));
    } finally {
      busy.current = false;
    }
  }

  const open = () => {
    setMessage(null);
    setConfirming(null);
    setForm({ workerId: null, amount: '', note: '', paidOn: istDate(now().toISOString()) });
  };

  const close = () => {
    setMessage(null);
    setForm(null);
  };

  const save = () =>
    guarded(async () => {
      if (!form || !db) return;
      if (form.workerId === null) throw new AdvanceError('worker_required');
      await saveAdvance(db, userId, siteId, { workerId: form.workerId, amount: form.amount, note: form.note, paidOn: form.paidOn }, now());
      if (alive.current) setForm(null);
    });

  const cancel = (recordId: string) =>
    guarded(async () => {
      if (!db) return;
      await reverseAdvance(db, userId, siteId, recordId, now());
      if (alive.current) setConfirming(null);
    });

  const patch = (change: Partial<Form>) => setForm((f) => (f ? { ...f, ...change } : f));

  const ready = load.kind === 'ready' ? load : null;

  return (
    <Screen>
      {load.kind === 'loading' && <Text>{t('common.loading')}</Text>}
      {load.kind === 'failed' && <LoadFailed message={t('siteAdvances.loadFailed')} onRetry={retry} />}
      {load.kind === 'missing' && <EmptyState title={t('siteAdvances.missing')} />}

      {ready && (
        <>
          <ScreenTitle screen="site_advances" siteName={ready.site.name} />
          <Text variant="title" bold accessibilityRole="header">
            {ready.site.name}
          </Text>
          <Text variant="small" color={colors.muted}>
            {t('siteAdvances.scopeNote')}
          </Text>

          {ready.workers.length === 0 && (
            <EmptyState title={t('siteAdvances.noWorkers')} hint={t('siteAdvances.noWorkersHint')} />
          )}
          {ready.workers.length > 0 && form === null && <Button label={t('siteAdvances.record')} onPress={open} />}

          {form && (
            <Card style={styles.panel}>
              <Text variant="heading" bold>
                {t('siteAdvances.record')}
              </Text>
              <Text variant="small" bold color={colors.muted}>
                {t('siteAdvances.worker')}
              </Text>
              {ready.workers.map((w) => (
                <Button
                  key={w.workerId}
                  label={`${w.name} · ${w.code}`}
                  kind={form.workerId === w.workerId ? 'primary' : 'secondary'}
                  icon={form.workerId === w.workerId ? 'ok' : undefined}
                  onPress={() => patch({ workerId: w.workerId })}
                />
              ))}
              <TextField
                label={t('siteAdvances.amount')}
                value={form.amount}
                onChangeText={(amount) => patch({ amount })}
                keyboardType="decimal-pad"
                autoCorrect={false}
              />
              <TextField
                label={t('siteAdvances.noteOptional')}
                value={form.note}
                onChangeText={(note) => patch({ note })}
                maxLength={500}
                multiline
              />
              <Text variant="small" bold color={colors.muted}>
                {t('siteAdvances.date')}
              </Text>
              <DatePickerField
                value={form.paidOn}
                max={istDate(now().toISOString())}
                onChange={(paidOn) => patch({ paidOn })}
                openPicker={openDatePicker}
              />
              {message && (
                <Text color={tone.attention.text} accessibilityLiveRegion="polite">
                  {message}
                </Text>
              )}
              <Button label={t('siteAdvances.save')} onPress={() => void save()} />
              <Button kind="secondary" label={t('siteAdvances.cancel')} onPress={close} />
            </Card>
          )}

          {ready.advances.length === 0 && form === null && ready.workers.length > 0 && (
            <EmptyState title={t('siteAdvances.empty')} />
          )}
          {ready.advances.length > 0 && (
            <Text variant="heading" bold accessibilityRole="header" style={styles.heading}>
              {t('siteAdvances.recent')}
            </Text>
          )}
          {/* A message about a cancellation shows here, since no form is open. */}
          {form === null && message && (
            <Text color={tone.attention.text} accessibilityLiveRegion="polite">
              {message}
            </Text>
          )}
          {ready.advances.map((a) => {
            const status = advanceStatusText(a.status, a.reason);
            const amount = formatRupees(a.amountPaise);
            return (
              <Card key={a.recordId}>
                <Text bold>{t('siteAdvances.entry', { amount, worker: a.workerName, date: a.paidOn })}</Text>
                {a.reversesId !== null && (
                  <Text variant="small" color={colors.muted}>
                    {t('siteAdvances.cancellation', { amount })}
                  </Text>
                )}
                {a.note !== null && (
                  <Text variant="small" color={colors.muted}>
                    {t('siteAdvances.entryNote', { note: a.note })}
                  </Text>
                )}
                <StatusBadge tone={status.tone} label={status.text} />
                {a.cancelled && <StatusBadge tone="wait" label={t('siteAdvances.cancelled')} />}
                {a.canCancel && confirming !== a.recordId && (
                  <Button kind="secondary" label={t('siteAdvances.cancelAdvance')} onPress={() => setConfirming(a.recordId)} />
                )}
                {a.canCancel && confirming === a.recordId && (
                  <>
                    <Text>{t('siteAdvances.confirmCancel', { amount })}</Text>
                    <Button label={t('siteAdvances.confirmYes')} onPress={() => void cancel(a.recordId)} />
                    <Button kind="secondary" label={t('siteAdvances.keep')} onPress={() => setConfirming(null)} />
                  </>
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
  panel: { gap: space.md },
  heading: { marginTop: space.sm },
});
