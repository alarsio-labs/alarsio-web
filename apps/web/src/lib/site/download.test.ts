import { describe, expect, it } from "vitest";
import { PILOT_APK, PILOT_APK_URL, apkFacts, apkHref } from "./download";

describe("PILOT_APK_URL", () => {
  it("is a valid https link to an APK", () => {
    expect(apkHref(PILOT_APK_URL)).toBe(PILOT_APK_URL);
    expect(PILOT_APK_URL.endsWith(".apk")).toBe(true);
  });

  it("is the GitHub Release asset for the version the page names", () => {
    expect(PILOT_APK_URL).toMatch(/^https:\/\/github\.com\/alarsio-labs\/alarsio-web\/releases\/download\/pilot-v[\d.]+\//);
    expect(PILOT_APK_URL).toContain(`pilot-v${PILOT_APK.version}/`);
  });
});

describe("apkFacts", () => {
  it("names the version, the build date and the size in decimal megabytes", () => {
    expect(apkFacts(PILOT_APK)).toBe("Version 0.1.0 · 6 Nov 2026 · 109 MB");
    expect(apkFacts({ version: "1.2.0", built: "1 Dec 2026", bytes: 54_400_000 })).toBe("Version 1.2.0 · 1 Dec 2026 · 54 MB");
  });
});

describe("apkHref", () => {
  it("accepts an https link", () => {
    expect(apkHref("https://expo.dev/artifacts/eas/abc.apk")).toBe("https://expo.dev/artifacts/eas/abc.apk");
    expect(apkHref("  https://example.com/a.apk  ")).toBe("https://example.com/a.apk");
  });

  it("refuses an empty, plain-http or broken value", () => {
    expect(apkHref(undefined)).toBeNull();
    expect(apkHref("")).toBeNull();
    expect(apkHref("http://example.com/a.apk")).toBeNull();
    expect(apkHref("javascript:alert(1)")).toBeNull();
    expect(apkHref("not a url")).toBeNull();
  });
});
