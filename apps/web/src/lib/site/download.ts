// Where the Android app is downloaded from. The deploy setting NEXT_PUBLIC_APK_URL (docs/DEPLOY.md)
// wins; without it the page uses the current pilot build's stable EAS link below. Replace that link
// (or set the variable) when a new pilot build ships. NEXT_PUBLIC_ values are fixed at build time.

/**
 * The pilot APK: EAS build 4e6ff308 (version 0.1.0, 6 Nov 2026: splash, tutorial, restyle, PR #186),
 * re-hosted on the GitHub Release pilot-v0.1.0, which starts in about a second where expo.dev took
 * about 23 s (pre-launch audit issue 8). The release notes hold the build id and the SHA-256.
 * A new build: upload it to a new release, then change this link and PILOT_APK below.
 */
export const PILOT_APK_URL = "https://github.com/alarsio-labs/alarsio-web/releases/download/pilot-v0.1.0/alarsio-pilot-0.1.0.apk";

/** What the Download page says about that file. Only true of PILOT_APK_URL, not of an override. */
export const PILOT_APK = { version: "0.1.0", built: "6 Nov 2026", bytes: 109_406_880 } as const;

/** "Version 0.1.0 · 6 Nov 2026 · 109 MB", in the decimal megabytes Android shows. */
export function apkFacts(apk: { version: string; built: string; bytes: number }): string {
  return `Version ${apk.version} · ${apk.built} · ${Math.round(apk.bytes / 1_000_000)} MB`;
}

/** An https link, or null when it is unset or not an https URL. */
export function apkHref(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const APK_URL = apkHref(process.env.NEXT_PUBLIC_APK_URL) ?? apkHref(PILOT_APK_URL);
