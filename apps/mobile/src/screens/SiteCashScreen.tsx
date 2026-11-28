// The site cash book: money in and out of the site's cash box, with no signal needed. Owner:
// Offline Sync (Nikhil). Issue #258, ADR-058. Every save goes to the outbox first, under the
// signed-in user. The list joins this user's saved entries, the entries the pull mirror holds and
// the advances paid here (read-only cash out). The box is worked out from those lines for this
// month; "On the server" appears only once the server has accepted a record (ADR-009).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { NOTE_MAX, advanceStatusText, formatRupees } from '../advances/advance';
import { CASH_CATEGORIES, CashError, cashErrorText, type CashLine } from '../cash/cash';
import { loadSiteCash, reverseEntry, saveEntry, type SiteCash } from '../cash/cash-store';
import type { DeviceDb } from '../db/device-db';
import { istDate, readSites, type MirrorSite } from '../sync/pull';
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

export interface SiteCashScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user: their cash entries and their copy of the site only. */
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
  | { kind: 'ready'; site: MirrorSite; cash: SiteCash };

interface Form {
  category: string;
  amount: string;
  note: string;
  entryDate: string;
}

export function SiteCashScreen({ openDb, userId, siteId, now = () => new Date(), pollMs = 3000, openDatePicker }: SiteCashScreenProps) {
  const { t } = useTranslation();
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [form, setForm] = useState<Form | null>(null);
  // The entry whose cancellation is waiting for a second tap.
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
      const cash = site ? await loadSiteCash(db, userId, siteId, now()) : null;
      if (!alive.current) return;
      const read = JSON.stringify([site ?? null, cash]);
      if (read === snapshot.current) return;
      snapshot.current = read;
      setLoad(site && cash ? { kind: 'ready', site, cash } : { kind: 'missing' });
    } catch {
      snapshot.current = '';
      if (alive.current) setLoad({ kind: 'failed' });
    }
    // `now` is read on each call; a new function on every render must not restart the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    error instanceof CashError ? cashErrorText(error.code) : t('siteCash.error.generic');

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
    setForm({ category: '', amount: '', note: '', entryDate: istDate(now().toISOString()) });
  };

  const close = () => {
    setMessage(null);
    setForm(null);
  };

  const save = () =>
    guarded(async () => {
      if (!form || !db) return;
      await saveEntry(db, userId, siteId, form, now());
      if (alive.current) setForm(null);
    });

  const cancel = (recordId: string) =>
    guarded(async () => {
      if (!db) return;
      await reverseEntry(db, userId, siteId, recordId, now());
      if (alive.current) setConfirming(null);
    });

  const patch = (change: Partial<Form>) => setForm((f) => (f ? { ...f, ...change } : f));

  const label = (line: CashLine) =>
    line.category === null
      ? t('siteCash.advance', { worker: line.workerName })
      : t(`siteCash.categories.${line.category}`);

  const ready = load.kind === 'ready' ? load : null;
  const balance = ready?.cash.balance;

  return (
    <Screen>
      {load.kind === 'loading' && <Text>{t('common.loading')}</Text>}
      {load.kind === 'failed' && <LoadFailed message={t('siteCash.loadFailed')} onRetry={retry} />}
      {load.kind === 'missing' && <EmptyState title={t('siteCash.missing')} />}

      {ready && balance && (
        <>
          <ScreenTitle screen="site_cash" siteName={ready.site.name} />
          <Text variant="title" bold accessibilityRole="header">
            {ready.site.name}
          </Text>
          <Text variant="small" color={colors.muted}>
            {t('siteCash.scopeNote')}
          </Text>

          <Card style={styles.panel}>
            <Text variant="small" color={colors.muted}>
              {t('siteCash.summary', {
                in: formatRupees(balance.inPaise),
                out: formatRupees(balance.outPaise),
                advances: formatRupees(balance.advancesPaise),
              })}
            </Text>
            {balance.boxPaise >= 0 ? (
              <Text variant="heading" bold>
                {t('siteCash.box', { amount: formatRupees(balance.boxPaise) })}
              </Text>
            ) : (
              <Text variant="heading" bold color={tone.attention.text}>
                {t('siteCash.boxBelow', { amount: formatRupees(-balance.boxPaise) })}
              </Text>
            )}
            {ready.cash.waiting > 0 && <StatusBadge tone="wait" label={t('siteCash.waiting', { count: ready.cash.waiting })} />}
          </Card>

          {form === null && <Button label={t('siteCash.record')} onPress={open} />}

          {form && (
            <Card style={styles.panel}>
              <Text variant="heading" bold>
                {t('siteCash.record')}
              </Text>
              <Text variant="small" bold color={colors.muted}>
                {t('siteCash.category')}
              </Text>
              {CASH_CATEGORIES.map((category) => (
                <Button
                  key={category}
                  label={t(`siteCash.categories.${category}`)}
                  kind={form.category === category ? 'primary' : 'secondary'}
                  icon={form.category === category ? 'ok' : undefined}
                  onPress={() => patch({ category })}
                />
              ))}
              <TextField
                label={t('siteCash.amount')}
                value={form.amount}
                onChangeText={(amount) => patch({ amount })}
                keyboardType="decimal-pad"
                autoCorrect={false}
              />
              <TextField
                label={t('siteCash.noteOptional')}
                value={form.note}
                onChangeText={(note) => patch({ note })}
                maxLength={NOTE_MAX}
                multiline
              />
              <Text variant="small" bold color={colors.muted}>
                {t('siteCash.date')}
              </Text>
              <DatePickerField
                value={form.entryDate}
                max={istDate(now().toISOString())}
                onChange={(entryDate) => patch({ entryDate })}
                openPicker={openDatePicker}
              />
              {message && (
                <Text color={tone.attention.text} accessibilityLiveRegion="polite">
                  {message}
                </Text>
              )}
              <Button label={t('siteCash.save')} onPress={() => void save()} />
              <Button kind="secondary" label={t('siteCash.cancel')} onPress={close} />
            </Card>
          )}

          {ready.cash.lines.length === 0 && form === null && <EmptyState title={t('siteCash.empty')} />}
          {ready.cash.lines.length > 0 && (
            <Text variant="heading" bold accessibilityRole="header" style={styles.heading}>
              {t('siteCash.recent')}
            </Text>
          )}
          {/* A message about a cancellation shows here, since no form is open. */}
          {form === null && message && (
            <Text color={tone.attention.text} accessibilityLiveRegion="polite">
              {message}
            </Text>
          )}
          {ready.cash.lines.map((line) => {
            const status = advanceStatusText(line.status, line.reason);
            const amount = formatRupees(line.amountPaise);
            return (
              <Card key={line.recordId}>
                <Text bold>{t('siteCash.entry', { label: label(line), amount, date: line.entryDate })}</Text>
                {line.source === 'advance' && (
                  <Text variant="small" color={colors.muted}>
                    {t('siteCash.advanceHint')}
                  </Text>
                )}
                {line.reversesId !== null && (
                  <Text variant="small" color={colors.muted}>
                    {t('siteCash.cancellation', { amount })}
                  </Text>
                )}
                {line.note !== null && (
                  <Text variant="small" color={colors.muted}>
                    {t('siteCash.entryNote', { note: line.note })}
                  </Text>
                )}
                <StatusBadge tone={status.tone} label={status.text} />
                {line.cancelled && <StatusBadge tone="wait" label={t('siteCash.cancelled')} />}
                {line.canCancel && confirming !== line.recordId && (
                  <Button kind="secondary" label={t('siteCash.cancelEntry')} onPress={() => setConfirming(line.recordId)} />
                )}
                {line.canCancel && confirming === line.recordId && (
                  <>
                    <Text>{t('siteCash.confirmCancel', { amount })}</Text>
                    <Button label={t('siteCash.confirmYes')} onPress={() => void cancel(line.recordId)} />
                    <Button kind="secondary" label={t('siteCash.keep')} onPress={() => setConfirming(null)} />
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
