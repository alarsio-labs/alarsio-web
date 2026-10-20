import type { DayStatus, ExceptionKind } from "./rows";
import type { StatusFilter } from "./filters";

// What the /attendance list shows. A row is one (site, date): the day when there is
// one, or only the exceptions raised on that date when no day was opened.

export type DayInput = { id: string; site_id: string; attendance_date: string; status: DayStatus };
export type ExceptionInput = {
  site_id: string;
  exception_date: string;
  kind: ExceptionKind;
  changed_since_review: boolean | null;
};

// day_awaiting_review and day_rejected repeat the day's own status, so they are not
// badges. fixed_since_rejection is day_rejected with changed_since_review (ADR-032 D7).
export const FLAGS = [
  "geofence_check_in",
  "geofence_check_out",
  "visit_not_closed",
  "correction_pending",
  "fixed_since_rejection"
] as const;
export type Flag = (typeof FLAGS)[number];

export type ListRow = {
  key: string;
  siteId: string;
  date: string;
  dayId: string | null;
  dayStatus: DayStatus | null;
  flags: Flag[];
  pendingCorrections: number;
  changedSinceReview: boolean;
  needsReview: boolean;
};

const keyOf = (siteId: string, date: string) => `${siteId}|${date}`;

export function buildRows(days: readonly DayInput[], exceptions: readonly ExceptionInput[]): ListRow[] {
  type Acc = { siteId: string; date: string; flags: Set<Flag>; pending: number; changed: boolean };
  const acc = new Map<string, Acc>();
  const slot = (siteId: string, date: string): Acc => {
    const k = keyOf(siteId, date);
    let a = acc.get(k);
    if (!a) {
      a = { siteId, date, flags: new Set(), pending: 0, changed: false };
      acc.set(k, a);
    }
    return a;
  };

  const dayByKey = new Map<string, DayInput>();
  for (const d of days) dayByKey.set(keyOf(d.site_id, d.attendance_date), d);

  for (const e of exceptions) {
    if (e.kind === "day_awaiting_review") continue;
    if (e.kind === "day_rejected") {
      // Only meaningful on a day that is in the list; it never makes a row alone.
      if (e.changed_since_review === true && dayByKey.has(keyOf(e.site_id, e.exception_date))) {
        const a = slot(e.site_id, e.exception_date);
        a.changed = true;
        a.flags.add("fixed_since_rejection");
      }
      continue;
    }
    const a = slot(e.site_id, e.exception_date);
    a.flags.add(e.kind);
    if (e.kind === "correction_pending") a.pending += 1;
  }
  for (const d of days) slot(d.site_id, d.attendance_date);

  return [...acc.entries()].map(([key, a]) => {
    const day = dayByKey.get(key) ?? null;
    // A date with only a geofence or not-closed flag and no day has nothing to
    // approve and no way to clear the flag, so it is under "All" only. A waiting
    // correction always counts.
    const needsReview =
      a.pending > 0 ||
      (day !== null && (day.status === "open" || (day.status === "rejected" && a.changed)));
    return {
      key,
      siteId: a.siteId,
      date: a.date,
      dayId: day?.id ?? null,
      dayStatus: day?.status ?? null,
      flags: FLAGS.filter((f) => a.flags.has(f)),
      pendingCorrections: a.pending,
      changedSinceReview: a.changed,
      needsReview
    };
  });
}

export function filterRows(rows: readonly ListRow[], status: StatusFilter): ListRow[] {
  switch (status) {
    case "all":
      return [...rows];
    case "needs_review":
      return rows.filter((r) => r.needsReview);
    default:
      return rows.filter((r) => r.dayStatus === status);
  }
}

// Newest date first. Within a date: a row with a flag first, then one waiting for
// review, then by site name, then by key, so the order is the same on every render.
export function sortRows(rows: readonly ListRow[], siteName: ReadonlyMap<string, string>): ListRow[] {
  const name = (r: ListRow) => siteName.get(r.siteId) ?? "Site";
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const fa = a.flags.length > 0;
    const fb = b.flags.length > 0;
    if (fa !== fb) return fa ? -1 : 1;
    if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
    const byName = name(a).localeCompare(name(b));
    if (byName !== 0) return byName;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}
