// Fixed messages for ?error= codes. Codes come from our own redirects; any
// unknown code shows the generic message, so a crafted URL cannot put text
// on the page.
const MESSAGES = {
  invalid_credentials: "Email or password is wrong.",
  email_not_confirmed: "Confirm your email first. Check your inbox for the link.",
  weak_password: "Use a password of at least 8 characters.",
  missing_fields: "Fill in every field.",
  sign_up_failed: "Could not create the account. Try again, or sign in if you already have one.",
  link_invalid: "That link is invalid or has expired. Request a new one.",
  org_name: "Enter an organisation name of 1 to 120 characters.",
  org_failed: "Could not create the organisation. Try again.",
  review_forbidden: "You cannot review this report.",
  review_note_long: "Keep the review note to 1000 characters or fewer.",
  generic: "Something went wrong. Try again."
} as const;

export type MessageCode = keyof typeof MESSAGES;

export function messageFor(code: unknown): string | null {
  if (typeof code !== "string" || code.length === 0) return null;
  return code in MESSAGES ? MESSAGES[code as MessageCode] : MESSAGES.generic;
}
