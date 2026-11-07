// Cookie consent for Google Analytics on the public pages. Analytics loads only after the
// visitor accepts; the choice is kept in a first-party cookie so the banner shows once.
// Pure helpers here; the banner is components/site/cookie-consent.tsx.

export type Consent = "granted" | "denied";

export const CONSENT_COOKIE = "alarsio_consent";
/** Six months, then we ask again. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;

/** The GA4 measurement ID from deploy settings, or undefined when it is missing or malformed. */
export function gaId(raw: string | undefined = process.env.NEXT_PUBLIC_GA_ID): string | undefined {
  const id = raw?.trim();
  return id && /^G-[A-Z0-9]{6,12}$/.test(id) ? id : undefined;
}

/** The saved choice in a document.cookie string, or null when there is none (or it is garbage). */
export function readConsent(cookieHeader: string): Consent | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CONSENT_COOKIE) {
      const value = rest.join("=");
      return value === "granted" || value === "denied" ? value : null;
    }
  }
  return null;
}

/** The Set-Cookie text for a choice. Secure only on https so it still works on localhost. */
export function consentCookie(value: Consent, https: boolean): string {
  return `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${https ? "; Secure" : ""}`;
}

/** Names of the GA cookies to remove when a visitor withdraws consent. */
export function gaCookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(";")
    .map((p) => p.trim().split("=")[0] ?? "")
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
}

/**
 * Expiring cookie strings for a name: on the host and on each parent domain, because GA sets
 * its cookies on the widest domain it can (.alarsio.com for www.alarsio.com).
 */
export function expireCookie(name: string, hostname: string): string[] {
  const out = [`${name}=; Max-Age=0; Path=/`];
  const labels = hostname.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    out.push(`${name}=; Max-Age=0; Path=/; Domain=.${labels.slice(i).join(".")}`);
  }
  return out;
}

/** Event the footer's "Cookie settings" link sends to reopen the banner. */
export const OPEN_CONSENT_EVENT = "alarsio:cookie-settings";
