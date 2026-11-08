// The demo enquiry form on /demo (docs/research/powerplay-2026-11.md §5). Pure rules only:
// what the form asks, how a reply is checked, and the email that reaches the team. The landing
// owns no table, so an enquiry is never stored: it is emailed and then forgotten.

export const SITE_COUNTS = ["1", "2–5", "6–10", "11–20", "20+"] as const;
export type SiteCount = (typeof SITE_COUNTS)[number];

export const CONTACT_WAYS = ["whatsapp", "call"] as const;
export type ContactWay = (typeof CONTACT_WAYS)[number];

/**
 * The promise shown on /demo. Change it here; every page reads these lines.
 * `within` runs around the clock (every day, not office hours only). `callHours` is when a
 * person answers the phone.
 */
export const REPLY_PROMISE = {
  within: "8 hours",
  callHours: "11am to 6pm IST"
};

/** A form opened less than this long ago is a bot: people cannot fill four fields that fast. */
export const MIN_FILL_MS = 3000;

export type Enquiry = {
  name: string;
  mobile: string; // 10 digits, no country code
  city: string;
  sites: SiteCount;
  company: string;
  contact: ContactWay;
};

export type EnquiryField = "name" | "mobile" | "city" | "sites" | "company";
export type EnquiryValues = Record<EnquiryField | "contact", string>;

export type CheckResult =
  | { ok: true; enquiry: Enquiry }
  | { ok: false; errors: Partial<Record<EnquiryField, string>> };

function text(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
}

/** The values as typed, to put back in the form after an error. */
export function valuesOf(form: FormData): EnquiryValues {
  return {
    name: text(form, "name"),
    mobile: text(form, "mobile"),
    city: text(form, "city"),
    sites: text(form, "sites"),
    company: text(form, "company"),
    contact: text(form, "contact")
  };
}

/** An Indian mobile as 10 digits, accepting +91, 91 or 0 in front; null if it is not one. */
export function indianMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function checkEnquiry(form: FormData): CheckResult {
  const v = valuesOf(form);
  const errors: Partial<Record<EnquiryField, string>> = {};

  if (v.name.length < 2) errors.name = "Enter your name.";
  else if (v.name.length > 80) errors.name = "Use 80 characters or fewer.";

  const mobile = indianMobile(v.mobile);
  if (!v.mobile) errors.mobile = "Enter your mobile number.";
  else if (!mobile) errors.mobile = "Enter a 10-digit Indian mobile number.";

  if (v.city.length < 2) errors.city = "Enter your city.";
  else if (v.city.length > 60) errors.city = "Use 60 characters or fewer.";

  if (!(SITE_COUNTS as readonly string[]).includes(v.sites)) errors.sites = "Choose how many sites you run.";

  if (v.company.length > 100) errors.company = "Use 100 characters or fewer.";

  if (Object.keys(errors).length > 0 || !mobile) return { ok: false, errors };

  return {
    ok: true,
    enquiry: {
      name: v.name,
      mobile,
      city: v.city,
      sites: v.sites as SiteCount,
      company: v.company,
      contact: v.contact === "call" ? "call" : "whatsapp"
    }
  };
}

/**
 * True when the form looks filled by a bot: the hidden field has text, or it came back too fast.
 * The start time is set by the browser's script, so a form sent without JavaScript has none and
 * is let through on the hidden field alone: a person on an old phone must never be dropped.
 */
export function looksLikeBot(form: FormData, now: number): boolean {
  const trap = form.get("website");
  if (typeof trap === "string" && trap.trim() !== "") return true;
  const started = Number(form.get("started"));
  if (!Number.isFinite(started) || started <= 0) return false;
  return now - started < MIN_FILL_MS;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** The email the team receives, with one-tap links to reply the way the person asked. */
export function enquiryEmail(e: Enquiry, receivedAt: Date) {
  const way = e.contact === "call" ? "Call" : "WhatsApp";
  const wa = `https://wa.me/91${e.mobile}`;
  const tel = `tel:+91${e.mobile}`;
  const when = receivedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const rows: [string, string][] = [
    ["Name", e.name],
    ["Mobile", `+91 ${e.mobile.slice(0, 5)} ${e.mobile.slice(5)}`],
    ["City", e.city],
    ["Active sites", e.sites],
    ["Company", e.company || "(not given)"],
    ["Prefers", way],
    ["Received", `${when} IST`]
  ];

  const subject = `Demo enquiry: ${e.name}, ${e.city} (${e.sites} sites)`;
  const text = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `WhatsApp: ${wa}`,
    `Call: ${tel}`,
    "",
    `Reply within ${REPLY_PROMISE.within}. This enquiry is not stored anywhere else.`
  ].join("\n");
  const html = `<table cellpadding="6" style="font:15px/1.5 system-ui,sans-serif;border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="color:#56524c">${k}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`)
    .join("")}</table><p style="font:15px system-ui,sans-serif"><a href="${wa}">WhatsApp them</a> · <a href="${tel}">Call them</a></p><p style="font:13px system-ui,sans-serif;color:#56524c">Reply within ${REPLY_PROMISE.within}. This enquiry is not stored anywhere else.</p>`;

  return { subject, text, html };
}

/** The message a visitor can send us on WhatsApp after the form. It carries none of their details. */
export const WHATSAPP_HELLO = "Hi Alarsio, I just asked for a demo on your website.";
