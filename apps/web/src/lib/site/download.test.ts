import { describe, expect, it } from "vitest";
import { PILOT_APK_URL, apkHref } from "./download";

describe("PILOT_APK_URL", () => {
  it("is a valid https link to an APK", () => {
    expect(apkHref(PILOT_APK_URL)).toBe(PILOT_APK_URL);
    expect(PILOT_APK_URL.endsWith(".apk")).toBe(true);
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
