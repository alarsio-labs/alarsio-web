// The name a person shows to their team (profiles.full_name). The database checks 1 to 120
// characters after trimming; this says so in words before asking it.

export const NAME_MAX = 120;
/** What a profile is called until its owner types a name (lib/profile.ts). */
export const PLACEHOLDER_NAME = "New user";

export type NameCode = "name_empty" | "name_long";
export type NameResult = { ok: true; name: string } | { ok: false; code: NameCode };

/** Trims the name and folds runs of spaces into one, then checks its length. */
export function parseDisplayName(raw: unknown): NameResult {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (name.length === 0) return { ok: false, code: "name_empty" };
  if (name.length > NAME_MAX) return { ok: false, code: "name_long" };
  return { ok: true, name };
}

export const NAME_MESSAGE: Record<NameCode | "name_failed", string> = {
  name_empty: "Type your name.",
  name_long: `Use at most ${NAME_MAX} characters.`,
  name_failed: "Your name could not be saved. Try again."
};

/** The name to show, or null while it is still the placeholder. */
export function shownName(name: string | null | undefined): string | null {
  const n = name?.trim();
  return n && n !== PLACEHOLDER_NAME ? n : null;
}
