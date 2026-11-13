import { describe, expect, it } from "vitest";
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE, inviteTokenFromNext, pendingInvitePath } from "./pending-invite";

// The invite a person opened before signing up or in. The dashboard sends someone with
// no organisation back to it, instead of offering to create a new organisation.

const TOKEN = "0123456789abcdef".repeat(4);

describe("inviteTokenFromNext", () => {
  it("reads the token from an invite path", () => {
    expect(inviteTokenFromNext(`/invite/${TOKEN}`)).toBe(TOKEN);
  });

  it("ignores every other path and a malformed token", () => {
    for (const next of ["/dashboard", "/team?org=o1", "/invite/abc", `/invite/${TOKEN.toUpperCase()}`,
      `/invite/${TOKEN}x`, `/invite/${TOKEN}/more`, `/invite/${TOKEN}?x=1`, `//invite/${TOKEN}`, ""]) {
      expect(inviteTokenFromNext(next)).toBeNull();
    }
  });
});

describe("pendingInvitePath", () => {
  it("goes back to the invite for a remembered token", () => {
    expect(pendingInvitePath(TOKEN)).toBe(`/invite/${TOKEN}`);
  });

  it("goes nowhere with no cookie or a tampered one", () => {
    for (const value of [undefined, "", "abc", `${TOKEN}/../x`, "https://evil.test"]) {
      expect(pendingInvitePath(value)).toBeNull();
    }
  });
});

describe("the cookie", () => {
  it("is named once and lasts as long as an invite (72 hours)", () => {
    expect(INVITE_COOKIE).toBe("alarsio_invite");
    expect(INVITE_COOKIE_MAX_AGE).toBe(72 * 60 * 60);
  });
});
