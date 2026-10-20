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
  export_rate_limited: "You can export 5 times an hour. Try again later.",
  export_failed: "The export could not be made, and nothing was downloaded. Try again.",
  material_name: "Enter a material name of 1 to 120 characters.",
  material_unit: "Choose a unit from the list.",
  material_threshold: "Enter the low-stock level as a number of 0 or more, with up to 3 decimals, or leave it blank for no alert.",
  material_exists: "This site already has a material with that name.",
  material_forbidden: "Only an owner or project manager can change materials.",
  material_not_found: "That material was not found, or you cannot change it.",
  site_name: "Enter a site name of 1 to 120 characters.",
  site_address: "Enter an address of 1 to 500 characters.",
  site_latitude: "Enter the latitude as a decimal from -90 to 90, for example 18.5204.",
  site_longitude: "Enter the longitude as a decimal from -180 to 180, for example 73.8567.",
  site_radius: "Enter the geofence radius as a whole number of metres from 50 to 2000.",
  site_status: "Choose planned, active, paused or completed. A site is archived with the Archive button.",
  site_exists: "A site with that name already exists in this organisation. Archived sites keep their names.",
  site_forbidden: "Only an owner or project manager can change sites.",
  site_not_allowed: "You are not allowed to change this site. It may be archived.",
  generic: "Something went wrong. Try again."
} as const;

export type MessageCode = keyof typeof MESSAGES;

export function messageFor(code: unknown): string | null {
  if (typeof code !== "string" || code.length === 0) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code as MessageCode] : MESSAGES.generic;
}
