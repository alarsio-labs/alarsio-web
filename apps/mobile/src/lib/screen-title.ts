// The header title of each screen: what it is, and which site it is for.
// A long site name is cut so the title and the header buttons both fit.

export type ScreenKey =
  | 'attendance_sites'
  | 'check_in'
  | 'day_register'
  | 'report_sites'
  | 'daily_report'
  | 'materials_sites'
  | 'site_materials'
  | 'help';

const NAMES: Record<ScreenKey, string> = {
  attendance_sites: 'Attendance',
  check_in: 'Check in',
  day_register: 'Day register',
  report_sites: 'Daily reports',
  daily_report: 'Daily report',
  materials_sites: 'Materials',
  site_materials: 'Materials',
  help: 'Help',
};

export const MAX_SITE_NAME = 22;

export function shortSiteName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length <= MAX_SITE_NAME ? trimmed : `${trimmed.slice(0, MAX_SITE_NAME - 1).trimEnd()}…`;
}

export function screenTitle(screen: ScreenKey, siteName?: string): string {
  const base = NAMES[screen];
  const site = siteName ? shortSiteName(siteName) : '';
  return site ? `${base} · ${site}` : base;
}
