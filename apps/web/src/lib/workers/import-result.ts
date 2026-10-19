// Plain words for import_workers()'s per-row reasons.

export const IMPORT_RULES =
  "Worker code up to 40 characters, name up to 120, trade up to 60, pay type daily or hourly, and phone like 98765 43210 or +91 98765 43210.";

const REASON: Record<string, string> = {
  invalid_value: `a value is missing or not allowed. ${IMPORT_RULES}`,
  not_permitted: "you are not allowed to change this worker",
  anonymized: "this worker's personal details were removed, so the row was left alone",
  pay_type_locked: "this worker already has a wage rate, so the pay type cannot change. Keep the old pay type, or add them under a new code"
};

export function reasonText(reason: string | undefined): string {
  return (reason !== undefined && Object.hasOwn(REASON, reason) ? REASON[reason] : undefined) ?? "could not be saved";
}
