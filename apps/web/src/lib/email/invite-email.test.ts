import { describe, expect, it } from "vitest";
import { buildInviteEmail, escapeHtml, inviteLink } from "./invite-email";

const token = "a".repeat(64);

describe("inviteLink", () => {
  it("builds the link from the site url and token", () => {
    expect(inviteLink("https://app.alarsio.in/", token)).toBe(`https://app.alarsio.in/invite/${token}`);
  });

  it("refuses anything that is not a 64-character hex token", () => {
    for (const bad of ["", "abc", "A".repeat(64), "../" + "a".repeat(61)]) {
      expect(() => inviteLink("https://x.in", bad)).toThrow();
    }
  });
});

describe("buildInviteEmail", () => {
  const base = { orgName: "Sharma Builders", inviterName: "Anil", role: "supervisor" as const, link: `https://x.in/invite/${token}`, validHours: 72 };

  it("names the org, the inviter, the role and the expiry", () => {
    const e = buildInviteEmail(base);
    expect(e.subject).toBe("Anil invited you to Sharma Builders on Alarsio");
    expect(e.text).toContain("as a supervisor");
    expect(e.text).toContain("expires in 72 hours");
    expect(e.text).toContain(base.link);
  });

  it("escapes names in the html body", () => {
    const e = buildInviteEmail({ ...base, orgName: '<script>"x"</script>' });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
  });

  it("keeps line breaks out of the subject", () => {
    const e = buildInviteEmail({ ...base, orgName: "A\r\nBcc: evil@x.in" });
    expect(e.subject).not.toMatch(/[\r\n]/);
  });

  it("escapes every html special character", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
