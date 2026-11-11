import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_TEMPLATES, type AuthTemplateName } from "./auth-templates";
import { emailDetails, emailLayout } from "./layout";

describe("emailLayout", () => {
  const html = emailLayout({
    preheader: "Pre",
    heading: "Hello",
    bodyHtml: "<strong>Body</strong>",
    button: { label: "Go", href: "https://x.in/a?b=1" },
    secondary: [{ label: "Other", href: "tel:+911234567890" }],
    footnote: "Small print"
  });

  it("is a full document with the wordmark, heading, body and footer", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("ALAR<span");
    expect(html).toContain(">Hello<");
    expect(html).toContain("<strong>Body</strong>");
    expect(html).toContain("www.alarsio.com");
  });

  it("shows the button, a copyable fallback link and the secondary link", () => {
    expect(html.match(/https:\/\/x\.in\/a\?b=1/g)).toHaveLength(3);
    expect(html).toContain('href="tel:+911234567890"');
    expect(html).toContain("Small print");
  });

  it("leaves out the button block when there is none", () => {
    const plain = emailLayout({ preheader: "p", heading: "h", bodyHtml: "b" });
    expect(plain).not.toContain("copy this link");
  });

  it("uses inline styles only, since email clients drop style blocks", () => {
    expect(html).not.toContain("<style");
  });
});

describe("emailDetails", () => {
  it("renders one row per pair", () => {
    expect(emailDetails([["A", "1"], ["B", "2"]]).match(/<tr>/g)).toHaveLength(2);
  });
});

describe("Supabase auth templates", () => {
  const dir = resolve(__dirname, "../../../../../supabase/templates");

  it("link through /auth/confirm with token_hash, the only form the route accepts", () => {
    expect(AUTH_TEMPLATES["confirm-signup"].html).toContain(
      "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard"
    );
    expect(AUTH_TEMPLATES["reset-password"].html).toContain(
      "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/update-password"
    );
    for (const t of Object.values(AUTH_TEMPLATES)) expect(t.html).not.toContain("{{ .ConfirmationURL }}");
  });

  // WRITE_AUTH_TEMPLATES=1 regenerates the files; otherwise the test fails when they drift.
  it.each(Object.keys(AUTH_TEMPLATES) as AuthTemplateName[])("supabase/templates/%s.html is up to date", (name) => {
    const file = resolve(dir, `${name}.html`);
    const html = AUTH_TEMPLATES[name].html + "\n";
    if (process.env.WRITE_AUTH_TEMPLATES) writeFileSync(file, html);
    expect(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).toBe(html);
  });
});
