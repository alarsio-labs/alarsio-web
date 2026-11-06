// Public contact details. Both come from deploy settings (docs/DEPLOY.md); nothing is hard-coded.
// NEXT_PUBLIC_ values are fixed at build time, so a change needs a redeploy.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined;
export const CONTACT_WHATSAPP = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || undefined;

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** A wa.me link for a phone number, or null when it does not have 10 to 15 digits. */
export function whatsAppHref(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = digitsOf(raw);
  return digits.length >= 10 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

/** The number as people read it: "+91 79772 39722" for an Indian number, else as typed. */
export function displayPhone(raw: string): string {
  const digits = digitsOf(raw);
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return raw.trim();
}
