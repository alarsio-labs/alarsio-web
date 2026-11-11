// One branded layout for every email Alarsio sends: app emails (invite, demo enquiry) and the
// Supabase Auth templates (supabase/templates). Pure string building, so it is unit tested.
//
// Email clients ignore <style> blocks and web fonts unevenly, so everything is inline and
// table-based, with system font fallbacks. Colours are the site's: cream page, ink header,
// Alarsio red for the button.

const C = {
  page: "#F7F2E6",
  card: "#FFFFFF",
  ink: "#1E130B",
  text: "#171717",
  muted: "#67625C",
  line: "#E4DFD3",
  red: "#C8231F",
  redOnInk: "#EF493C"
} as const;

const FONT = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY = "Anton,Impact,'Arial Black','Arial Narrow Bold',sans-serif";

export type EmailButton = { label: string; href: string };

/**
 * Wraps already-escaped body HTML in the Alarsio frame.
 * `href` and `label` are inserted as given: callers escape user input before passing it in,
 * so Supabase placeholders such as {{ .ConfirmationURL }} survive untouched.
 */
export function emailLayout(input: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  button?: EmailButton;
  secondary?: EmailButton[];
  footnote?: string;
}): string {
  const button = input.button
    ? `<tr><td style="padding:8px 0 4px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${C.red}" style="border-radius:999px">
      <a href="${input.button.href}" target="_blank" style="display:inline-block;padding:14px 28px;font:600 16px/1 ${FONT};color:#FFFFFF;text-decoration:none;border-radius:999px">${input.button.label}</a>
    </td></tr></table>
</td></tr>`
    : "";

  const secondary = input.secondary?.length
    ? `<tr><td style="padding:12px 0 0;font:15px/1.5 ${FONT};color:${C.text}">${input.secondary
        .map((b) => `<a href="${b.href}" target="_blank" style="color:${C.red};font-weight:600;text-decoration:none">${b.label}</a>`)
        .join(` <span style="color:${C.muted}">&nbsp;·&nbsp;</span> `)}</td></tr>`
    : "";

  const fallback = input.button
    ? `<tr><td style="padding:20px 0 0;font:13px/1.5 ${FONT};color:${C.muted}">If the button does not work, copy this link into your browser:<br><a href="${input.button.href}" style="color:${C.muted};word-break:break-all">${input.button.href}</a></td></tr>`
    : "";

  const footnote = input.footnote
    ? `<tr><td style="padding:20px 0 0;font:13px/1.5 ${FONT};color:${C.muted}">${input.footnote}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${input.heading}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page}">${input.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td bgcolor="${C.ink}" style="background:${C.ink};border-radius:16px 16px 0 0;padding:22px 32px">
      <span style="font:400 30px/1 ${DISPLAY};letter-spacing:.5px;color:#E7E2D8;text-transform:uppercase">ALAR<span style="color:${C.redOnInk}">SIO</span></span>
    </td></tr>
    <tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-top:0;border-radius:0 0 16px 16px;padding:32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:0 0 16px;font:700 24px/1.25 ${FONT};color:${C.text}">${input.heading}</td></tr>
        <tr><td style="padding:0 0 20px;font:16px/1.6 ${FONT};color:${C.text}">${input.bodyHtml}</td></tr>
        ${button}${secondary}${fallback}${footnote}
      </table>
    </td></tr>
    <tr><td align="center" style="padding:20px 8px 0;font:12px/1.6 ${FONT};color:${C.muted}">
      Alarsio · Site records that work with no signal<br>
      <a href="https://www.alarsio.com" style="color:${C.muted}">www.alarsio.com</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** A label/value table for structured emails such as the demo enquiry. Values must be escaped already. */
export function emailDetails(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid ${C.line};font:14px/1.4 ${FONT};color:${C.muted};white-space:nowrap;vertical-align:top">${k}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};font:600 15px/1.4 ${FONT};color:${C.text}">${v}</td></tr>`
    )
    .join("")}</table>`;
}
