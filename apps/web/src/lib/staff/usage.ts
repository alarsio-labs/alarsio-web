// Shaping for /staff/usage (ADR-052). The database decides who may call
// staff_org_usage() and what it returns: counts and dates only. These helpers
// check the rows are what the page expects, write the Indian calendar, and pick
// which organisations to show. Nothing here reads anything.

const ZONE = "Asia/Kolkata";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const WEEKS = 4;

// One row of staff_org_usage(), in the order the function declares them.
export type UsageRow = {
  org_id: string;
  org_name: string;
  created_at: string;
  owners: number;
  project_managers: number;
  supervisors: number;
  accountants: number;
  active_users_28d: number;
  sites: number;
  workers: number;
  attendance_marks: number;
  daily_reports: number;
  material_entries: number;
  site_check_ins: number;
  last_active: string | null;
  last_sign_in: string | null;
  // The Monday (Asia/Kolkata) of the current week, as the database counted it.
  week_start: string;
  // Records created per week, oldest first, the last one being the current week.
  weekly_records: number[];
};

type Rec = Record<string, unknown>;
const rec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): v is string => typeof v === "string";
const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const stamp = (v: unknown): v is string | null => v === null || (str(v) && !Number.isNaN(Date.parse(v)));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const COUNT_KEYS = [
  "owners", "project_managers", "supervisors", "accountants", "active_users_28d", "sites", "workers",
  "attendance_marks", "daily_reports", "material_entries", "site_check_ins"
] as const;

export const isUsageRow = (v: unknown): v is UsageRow =>
  rec(v) &&
  str(v.org_id) &&
  str(v.org_name) &&
  str(v.created_at) &&
  !Number.isNaN(Date.parse(v.created_at)) &&
  COUNT_KEYS.every((k) => count(v[k])) &&
  stamp(v.last_active) &&
  stamp(v.last_sign_in) &&
  str(v.week_start) &&
  DAY.test(v.week_start) &&
  Array.isArray(v.weekly_records) &&
  v.weekly_records.length === WEEKS &&
  v.weekly_records.every(count);

// A test or demo organisation: the whole word "test", or "(Demo)". A whole word, so a
// customer called "Latest Builders" or "Contest Homes" is not hidden.
export const isTestOrg = (name: string): boolean => /\btest\b/i.test(name) || /\(demo\)/i.test(name);

// Day, month and year on the Indian calendar. The month is spelled out here, not by
// Intl, whose short month names differ between Node versions.
const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

function parts(iso: string): { d: string; m: string; y: string; hh: string; mm: string } {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { d: String(Number(p.day)), m: MONTHS[Number(p.month) - 1] ?? "?", y: p.year ?? "", hh: p.hour ?? "00", mm: p.minute ?? "00" };
}

export function istDate(iso: string | null): string {
  if (iso === null) return "—";
  const p = parts(iso);
  return `${p.d} ${p.m} ${p.y}`;
}

export function istDateTime(iso: string | null): string {
  if (iso === null) return "—";
  const p = parts(iso);
  return `${p.d} ${p.m} ${p.y}, ${p.hh}:${p.mm} IST`;
}

const dayLabel = (t: Date) => `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;

// The last four weeks as "9 Nov – 15 Nov", oldest first, from the Monday the database
// used. Pure date arithmetic in UTC, so the server's own time zone cannot move a week.
export function weekLabels(weekStart: string): string[] {
  const [y, m, d] = weekStart.split("-").map(Number);
  const monday = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(monday + (i - (WEEKS - 1)) * 7 * 86_400_000);
    const end = new Date(start.getTime() + 6 * 86_400_000);
    return `${dayLabel(start)} – ${dayLabel(end)}`;
  });
}

export type UsageView = {
  orgId: string;
  name: string;
  created: string;
  members: string;
  activeUsers: number;
  sites: number;
  workers: number;
  attendance: number;
  reports: number;
  materials: number;
  checkIns: number;
  lastActive: string;
  lastSignIn: string;
  weeks: number[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// "3 (1 owner, 2 supervisors)": the total, then the roles that have anyone.
function membersLabel(r: UsageRow): string {
  const total = r.owners + r.project_managers + r.supervisors + r.accountants;
  const by = [
    r.owners > 0 && plural(r.owners, "owner", "owners"),
    r.project_managers > 0 && plural(r.project_managers, "project manager", "project managers"),
    r.supervisors > 0 && plural(r.supervisors, "supervisor", "supervisors"),
    r.accountants > 0 && plural(r.accountants, "accountant", "accountants")
  ].filter((x): x is string => typeof x === "string");
  return by.length === 0 ? String(total) : `${total} (${by.join(", ")})`;
}

export type UsageScreen = { rows: UsageView[]; hidden: number; weekLabels: string[] };

// Oldest account first, as the hand-run query ordered them. Test organisations are left
// out unless asked for, and counted, so none disappears without the page saying so.
export function shapeUsage(rows: readonly UsageRow[], opts: { showTest: boolean }): UsageScreen {
  const shown = rows.filter((r) => opts.showTest || !isTestOrg(r.org_name));
  const ordered = [...shown].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.org_name.localeCompare(b.org_name)
  );
  return {
    rows: ordered.map((r) => ({
      orgId: r.org_id,
      name: r.org_name,
      created: istDate(r.created_at),
      members: membersLabel(r),
      activeUsers: r.active_users_28d,
      sites: r.sites,
      workers: r.workers,
      attendance: r.attendance_marks,
      reports: r.daily_reports,
      materials: r.material_entries,
      checkIns: r.site_check_ins,
      lastActive: istDateTime(r.last_active),
      lastSignIn: istDateTime(r.last_sign_in),
      weeks: r.weekly_records
    })),
    hidden: rows.length - shown.length,
    weekLabels: ordered[0] ? weekLabels(ordered[0].week_start) : []
  };
}
