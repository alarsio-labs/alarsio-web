// The sites a supervisor can file today's report for, and their unfinished reports
// from earlier days. Owner: Daily Reporting (Anuradha). Issue #81, ADR-036. Reads
// only this user's copy of the sites and this user's reports.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DeviceDb } from '../db/device-db';
import { dayLabel, reportStatusText, type ReportTone } from '../reports/report';
import { findReport, listUnfinished, type StoredReport } from '../reports/report-store';
import { istDate, readSites, type MirrorSite } from '../sync/pull';

export interface ReportSitesScreenProps {
  openDb: () => Promise<DeviceDb>;
  /** The signed-in user. Another user's copy of the sites reads as nothing (ADR-023). */
  userId: string;
  onOpenReport: (siteId: string, date: string) => void;
  /** The phone's clock. Tests pass their own. */
  now?: () => Date;
  /** How often the list re-reads the phone, so a report saved or answered shows. 0 turns it off. */
  pollMs?: number;
}

interface SiteRow {
  site: MirrorSite;
  today: StoredReport | null;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; rows: SiteRow[]; unfinished: StoredReport[] };

const toneStyle: Record<ReportTone, { color: string }> = {
  wait: { color: '#8a5a00' },
  ok: { color: '#1b6e20' },
  attention: { color: '#b00020' },
};

function statusOf(stored: StoredReport | null): { tone: ReportTone | null; text: string } {
  if (!stored) return { tone: null, text: 'Not started' };
  const s = reportStatusText(stored.report.status, stored.status, stored.reason);
  // A draft still on the phone says so, not only "waiting to send".
  if (stored.report.status === 'draft' && s.tone === 'wait') return { tone: 'wait', text: 'Draft, saved on this phone' };
  return s;
}

export function ReportSitesScreen({ openDb, userId, onOpenReport, now = () => new Date(), pollMs = 3000 }: ReportSitesScreenProps) {
  const [db, setDb] = useState<DeviceDb | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const alive = useRef(true);
  const snapshot = useRef('');
  const today = istDate(now().toISOString());

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
      // A fixed sentence: the error can name files (ADR-029).
      () => {
        if (alive.current) setLoad({ kind: 'failed' });
      },
    );
  }, [openDb]);

  const refresh = useCallback(async () => {
    if (!db) return;
    try {
      const sites = await readSites(db, userId);
      const rows: SiteRow[] = [];
      for (const site of sites) rows.push({ site, today: await findReport(db, userId, site.id, today) });
      // An unfinished report for a site no longer on the phone cannot be opened: leave it out.
      const held = new Set(sites.map((s) => s.id));
      const unfinished = (await listUnfinished(db, userId, today)).filter((r) => held.has(r.report.siteId));
      if (!alive.current) return;
      const read = JSON.stringify([rows, unfinished]);
      if (read === snapshot.current) return;
      snapshot.current = read;
      setLoad({ kind: 'ready', rows, unfinished });
    } catch {
      snapshot.current = '';
      if (alive.current) setLoad({ kind: 'failed' });
    }
  }, [db, userId, today]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const tick = db && pollMs > 0 ? setInterval(() => void refresh(), pollMs) : undefined;
    return () => {
      clearTimeout(first);
      if (tick) clearInterval(tick);
    };
  }, [db, refresh, pollMs]);

  const siteName = (siteId: string) =>
    load.kind === 'ready' ? (load.rows.find((r) => r.site.id === siteId)?.site.name ?? '') : '';

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Daily report
      </Text>
      {load.kind === 'loading' && <Text style={styles.line}>Loading…</Text>}
      {load.kind === 'failed' && <Text style={styles.error}>Could not read the sites on this phone.</Text>}
      {load.kind === 'ready' && load.rows.length === 0 && (
        <Text style={styles.line}>No sites on this phone yet. Connect once to download your sites.</Text>
      )}
      {load.kind === 'ready' && load.rows.length > 0 && (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          <Text style={styles.section}>{`Today, ${dayLabel(today)}`}</Text>
          {load.rows.map(({ site, today: stored }) => {
            const status = statusOf(stored);
            return (
              <Pressable
                key={site.id}
                accessibilityRole="button"
                accessibilityLabel={`${site.name}, ${status.text}`}
                onPress={() => onOpenReport(site.id, today)}
                style={styles.card}
              >
                <Text style={styles.siteName}>{site.name}</Text>
                <Text style={[styles.status, status.tone ? toneStyle[status.tone] : null]}>{status.text}</Text>
              </Pressable>
            );
          })}

          {load.unfinished.length > 0 && <Text style={styles.section}>Not finished</Text>}
          {load.unfinished.map((stored) => {
            const status = statusOf(stored);
            const label = `${siteName(stored.report.siteId)}, ${dayLabel(stored.report.reportDate)}`;
            return (
              <Pressable
                key={stored.recordId}
                accessibilityRole="button"
                accessibilityLabel={`${label}, ${status.text}`}
                onPress={() => onOpenReport(stored.report.siteId, stored.report.reportDate)}
                style={styles.card}
              >
                <Text style={styles.siteName}>{label}</Text>
                <Text style={[styles.status, status.tone ? toneStyle[status.tone] : null]}>{status.text}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  line: { fontSize: 16, color: '#333' },
  error: { fontSize: 16, color: '#b00020' },
  section: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 8 },
  list: { flex: 1 },
  listContent: { gap: 12, paddingBottom: 24 },
  card: { minHeight: 44, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, gap: 2 },
  siteName: { fontSize: 18, fontWeight: '600' },
  status: { fontSize: 14, color: '#333' },
});
