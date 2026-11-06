// Where the Android app is downloaded from. The deploy setting NEXT_PUBLIC_APK_URL (docs/DEPLOY.md)
// wins; without it the page uses the current pilot build's stable EAS link below. Replace that link
// (or set the variable) when a new pilot build ships. NEXT_PUBLIC_ values are fixed at build time.

/** The pilot APK from EAS build 4e6ff308 (version 0.1.0, 6 Nov 2026: splash, tutorial, restyle, PR #186). */
export const PILOT_APK_URL = "https://expo.dev/artifacts/eas/AK9YQfFwRTiRL2DsS4S8vFIaCqLNsVMYagWOKDOyD70.apk";

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
