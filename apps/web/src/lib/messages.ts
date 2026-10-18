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
  worker_invalid: "Check the worker: code, name and trade are required, pay type is daily or hourly, and the phone looks like a phone number.",
  worker_code_taken: "Another worker in this organisation already has that code.",
  not_permitted: "You are not allowed to do that.",
  rate_invalid: "Enter a rate above zero and the date it starts.",
  rate_same_day: "This worker already has a rate starting that day. Pick another date.",
  assign_duplicate: "This worker is already on that site.",
  assign_blocked: "That site is archived, or the worker is inactive.",
  generic: "Something went wrong. Try again."
} as const;

const NOTICES = {
  worker_added: "Worker added.",
  worker_saved: "Changes saved.",
  rate_added: "Rate added. Earlier rates are kept.",
  assigned: "Assigned to the site.",
  unassigned: "Removed from the site. The history is kept.",
  anonymized: "Personal details removed. Attendance and wage history are kept."
} as const;

export function noticeFor(code: unknown): string | null {
  if (typeof code !== "string" || !(code in NOTICES)) return null;
  return NOTICES[code as keyof typeof NOTICES];
}

export type MessageCode = keyof typeof MESSAGES;

export function messageFor(code: unknown): string | null {
  if (typeof code !== "string" || code.length === 0) return null;
  return code in MESSAGES ? MESSAGES[code as MessageCode] : MESSAGES.generic;
}
