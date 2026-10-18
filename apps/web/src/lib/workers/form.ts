// Reads worker fields from a form. Shared by add and edit.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function formText(form: FormData, name: string, max: number): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function workerFields(form: FormData) {
  const phone = formText(form, "phone", 30);
  return {
    full_name: formText(form, "full_name", 120),
    trade: formText(form, "trade", 60),
    pay_type: formText(form, "pay_type", 10).toLowerCase(),
    phone: phone === "" ? null : phone
  };
}

/** Maps a PostgREST error to one of our message codes. */
export function workerErrorCode(code: string | undefined): string {
  switch (code) {
    case "23505":
      return "worker_code_taken";
    case "23514":
    case "23502":
    case "22P02":
      return "worker_invalid";
    case "42501":
      return "not_permitted";
    default:
      return "generic";
  }
}

/** A rupee amount from a form: digits with up to two decimals, above zero. */
export function parseRate(value: string): number | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

/** A calendar date from an <input type="date">: YYYY-MM-DD and real. */
export function parseDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}
