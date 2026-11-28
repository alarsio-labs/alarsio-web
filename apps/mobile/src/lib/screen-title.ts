// The header title of each screen: what it is, and which site it is for.
// A long site name is cut so the title and the header buttons both fit.

import i18n from '../i18n';

export type ScreenKey =
  | 'attendance_sites'
  | 'check_in'
  | 'day_register'
  | 'worker_month'
  | 'report_sites'
  | 'daily_report'
  | 'materials_sites'
  | 'site_materials'
  | 'site_advances'
  | 'site_cash'
  | 'help';

export const MAX_SITE_NAME = 22;

export function shortSiteName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length <= MAX_SITE_NAME ? trimmed : `${trimmed.slice(0, MAX_SITE_NAME - 1).trimEnd()}…`;
}

export function screenTitle(screen: ScreenKey, siteName?: string): string {
  const base = i18n.t(`titles.${screen}`);
  const site = siteName ? shortSiteName(siteName) : '';
  return site ? `${base} · ${site}` : base;
}
