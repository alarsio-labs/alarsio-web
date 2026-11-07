"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type Consent,
  OPEN_CONSENT_EVENT,
  consentCookie,
  expireCookie,
  gaCookieNames,
  gaId,
  readConsent
} from "@/lib/site/consent";

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const GA_ID = gaId();

// gtag.js checks window["ga-disable-<id>"] before sending anything.
function setDisabled(id: string, disabled: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled;
}

// Loads gtag.js once, after consent. Consent Mode v2: analytics on, every ads signal off.
function loadAnalytics(id: string) {
  const w = window;
  setDisabled(id, false);
  if (w.gtag) {
    w.gtag("consent", "update", { analytics_storage: "granted" });
    return;
  }
  const layer = (w.dataLayer = w.dataLayer || []);
  w.gtag = function gtag() {
    // gtag.js reads the arguments object, not an array.
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  w.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted"
  });
  w.gtag("js", new Date());
  w.gtag("config", id, { allow_google_signals: false, allow_ad_personalization_signals: false });

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

// Stops GA and removes its cookies when a visitor who accepted changes their mind.
function stopAnalytics(id: string) {
  setDisabled(id, true);
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  for (const name of gaCookieNames(document.cookie)) {
    for (const c of expireCookie(name, location.hostname)) document.cookie = c;
  }
}

/**
 * The cookie banner for the public pages. Shows only when GA is configured and the visitor has
 * not chosen yet; Accept and Reject carry equal weight. Renders nothing on the server, so the
 * static pages stay static.
 */
export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!GA_ID) return;
    const saved = readConsent(document.cookie);
    if (saved === "granted") loadAnalytics(GA_ID);
    // Reading the cookie needs the browser, so the first open has to happen after mount.
    else if (saved === null) setOpen(true);

    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  if (!GA_ID || !open) return null;

  const choose = (value: Consent) => {
    document.cookie = consentCookie(value, location.protocol === "https:");
    if (value === "granted") loadAnalytics(GA_ID);
    else stopAnalytics(GA_ID);
    setOpen(false);
  };

  return (
    <section className="lp-consent" role="region" aria-label="Cookie choice">
      <p>
        We use Google Analytics cookies to count visits and see which pages help. They load only if you accept.
        Sign-in cookies are always on. <Link href="/privacy#cookies">Privacy Policy</Link>
      </p>
      <div className="lp-consent-actions">
        <button type="button" className="lp-pill lp-pill-ghost" onClick={() => choose("denied")}>Reject</button>
        <button type="button" className="lp-pill lp-pill-red" onClick={() => choose("granted")}>Accept</button>
      </div>
    </section>
  );
}

/** Footer link that reopens the banner. Hidden when analytics is not configured. */
export function CookieSettingsLink() {
  if (!GA_ID) return null;
  return (
    <button type="button" className="lp-consent-link" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}>
      Cookie settings
    </button>
  );
}
