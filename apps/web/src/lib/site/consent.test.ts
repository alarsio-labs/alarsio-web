import { describe, expect, it } from "vitest";
import { CONSENT_COOKIE, consentCookie, expireCookie, gaCookieNames, gaId, readConsent } from "./consent";

describe("gaId", () => {
  it("accepts a GA4 measurement ID", () => {
    expect(gaId("G-L0CSTSLJJY")).toBe("G-L0CSTSLJJY");
    expect(gaId("  G-ABC123  ")).toBe("G-ABC123");
  });

  it("rejects empty, missing and malformed values", () => {
    expect(gaId(undefined)).toBeUndefined();
    expect(gaId("")).toBeUndefined();
    expect(gaId("UA-12345-1")).toBeUndefined();
    expect(gaId("G-abc123")).toBeUndefined();
    expect(gaId('G-ABC123"><script>')).toBeUndefined();
  });
});

describe("readConsent", () => {
  it("reads a saved choice among other cookies", () => {
    expect(readConsent(`sb-x=1; ${CONSENT_COOKIE}=granted; _ga=GA1.1`)).toBe("granted");
    expect(readConsent(`${CONSENT_COOKIE}=denied`)).toBe("denied");
  });

  it("returns null when there is no choice or it is garbage", () => {
    expect(readConsent("")).toBeNull();
    expect(readConsent("sb-x=1; other=granted")).toBeNull();
    expect(readConsent(`${CONSENT_COOKIE}=yes`)).toBeNull();
    expect(readConsent(`x${CONSENT_COOKIE}=granted`)).toBeNull();
  });
});

describe("consentCookie", () => {
  it("lasts six months, site-wide, Lax", () => {
    const c = consentCookie("granted", false);
    expect(c).toMatch(new RegExp(`^${CONSENT_COOKIE}=granted;`));
    expect(c).toContain("Max-Age=15724800");
    expect(c).toContain("Path=/");
    expect(c).toContain("SameSite=Lax");
    expect(c).not.toContain("Secure");
  });

  it("is Secure on https", () => {
    expect(consentCookie("denied", true)).toContain("; Secure");
  });
});

describe("gaCookieNames", () => {
  it("finds only the GA cookies", () => {
    expect(gaCookieNames(`_ga=1; _ga_L0CSTSLJJY=2; sb-auth=3; ${CONSENT_COOKIE}=granted; _gat=4`)).toEqual([
      "_ga",
      "_ga_L0CSTSLJJY"
    ]);
    expect(gaCookieNames("")).toEqual([]);
  });
});

describe("expireCookie", () => {
  it("expires on the host and every parent domain, never the bare TLD", () => {
    expect(expireCookie("_ga", "www.alarsio.com")).toEqual([
      "_ga=; Max-Age=0; Path=/",
      "_ga=; Max-Age=0; Path=/; Domain=.www.alarsio.com",
      "_ga=; Max-Age=0; Path=/; Domain=.alarsio.com"
    ]);
  });

  it("expires host-only on localhost", () => {
    expect(expireCookie("_ga", "localhost")).toEqual(["_ga=; Max-Age=0; Path=/"]);
  });
});
