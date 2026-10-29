// What the Create organisation form sends (issue #139). create_organization()
// takes a name and a timezone and refuses an unknown timezone itself; the currency
// is INR for every organisation (organizations.currency, check = 'INR').

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const CURRENCY = "INR";

export type OrgForm = { ok: true; name: string; timezone: string } | { ok: false; code: "org_name" };

export function parseOrgForm(form: FormData): OrgForm {
  const rawName = form.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name.length < 1 || name.length > 120) return { ok: false, code: "org_name" };
  const rawTz = form.get("timezone");
  const timezone = typeof rawTz === "string" && rawTz.trim() !== "" ? rawTz.trim() : DEFAULT_TIMEZONE;
  return { ok: true, name, timezone };
}

// ICU still lists some zones under their old names; Postgres knows the current ones.
const CURRENT_NAME: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Europe/Kiev": "Europe/Kyiv"
};

/** The timezone choices, current names, sorted, with the default first. */
export function timezoneOptions(zones: readonly string[]): string[] {
  const set = new Set(zones.map((z) => CURRENT_NAME[z] ?? z));
  set.delete(DEFAULT_TIMEZONE);
  return [DEFAULT_TIMEZONE, ...[...set].sort()];
}
