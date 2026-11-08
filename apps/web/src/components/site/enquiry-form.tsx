"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendEnquiry, type EnquiryState } from "@/app/(site)/demo/actions";
import { CONTACT_WAYS, REPLY_PROMISE, SITE_COUNTS, valuesOf, type EnquiryField } from "@/lib/site/enquiry";

type FormState = EnquiryState | { status: "stale"; values: ReturnType<typeof valuesOf> };

// Calls the server action, and turns a thrown error into a state the form can show. The usual
// cause is a page opened before a new deploy: its action ID no longer exists on the server, and
// without this the whole page would be replaced by the error screen.
async function submit(prev: FormState, form: FormData): Promise<FormState> {
  try {
    return await sendEnquiry(prev.status === "stale" ? { status: "idle" } : prev, form);
  } catch {
    return { status: "stale", values: valuesOf(form) };
  }
}

const ORDER: EnquiryField[] = ["name", "mobile", "city", "sites", "company"];

// The demo enquiry form (/demo). Four questions are required, two are not. It works without
// JavaScript (a plain form post to the server action); with it, the page does not reload.
export function EnquiryForm({ whatsApp, call }: { whatsApp: string | null; call: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submit, { status: "idle" });
  const [started, setStarted] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const done = useRef<HTMLHeadingElement>(null);

  useEffect(() => setStarted(String(Date.now())), []);

  useEffect(() => {
    if (state.status === "sent") done.current?.focus();
    if (state.status === "invalid") {
      const first = ORDER.find((f) => state.errors[f]);
      if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    }
  }, [state]);

  if (state.status === "sent") {
    return (
      <div className="ef-done" role="status">
        <h2 ref={done} tabIndex={-1}>Got it. We&apos;ll be in touch soon.</h2>
        <p>
          We reply within {REPLY_PROMISE.within}, on WhatsApp or by phone, the way you chose.
        </p>
        {whatsApp ? (
          <a className="lp-pill lp-pill-ink" href={whatsApp} target="_blank" rel="noopener noreferrer">
            Message us on WhatsApp now
          </a>
        ) : null}
      </div>
    );
  }

  const values = state.status === "invalid" || state.status === "failed" || state.status === "stale" ? state.values : undefined;
  const errors = state.status === "invalid" ? state.errors : {};
  const err = (f: EnquiryField) =>
    errors[f] ? { "aria-invalid": true as const, "aria-describedby": `ef-${f}-err` } : {};
  const msg = (f: EnquiryField) =>
    errors[f] ? <p id={`ef-${f}-err`} className="ef-err">{errors[f]}</p> : null;

  return (
    <form ref={form} action={action} className="ef" noValidate>
      {state.status === "stale" ? (
        <div className="ef-alert" role="alert">
          <p>This page was updated while it was open, so your details were not sent. Reload the page and send them again.</p>
          <p className="ef-alert-links">
            <button type="button" className="ef-reload" onClick={() => window.location.reload()}>Reload the page</button>
            {whatsApp ? <a href={whatsApp} target="_blank" rel="noopener noreferrer">WhatsApp us</a> : null}
          </p>
        </div>
      ) : null}
      {state.status === "failed" ? (
        <div className="ef-alert" role="alert">
          <p>We couldn&apos;t send this just now. Please try again, or reach us directly:</p>
          <p className="ef-alert-links">
            {whatsApp ? <a href={whatsApp} target="_blank" rel="noopener noreferrer">WhatsApp us</a> : null}
            {call ? <a href={call}>Call us</a> : null}
          </p>
        </div>
      ) : null}

      <div className="ef-field">
        <label htmlFor="ef-name">Your name</label>
        <input id="ef-name" name="name" autoComplete="name" required maxLength={80} defaultValue={values?.name} {...err("name")} />
        {msg("name")}
      </div>

      <div className="ef-field">
        <label htmlFor="ef-mobile">Mobile number</label>
        <div className="ef-tel">
          <span aria-hidden="true">+91</span>
          <input
            id="ef-mobile"
            name="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            required
            maxLength={16}
            defaultValue={values?.mobile}
            {...err("mobile")}
          />
        </div>
        {msg("mobile")}
      </div>

      <div className="ef-field">
        <label htmlFor="ef-city">City</label>
        <input id="ef-city" name="city" autoComplete="address-level2" required maxLength={60} defaultValue={values?.city} {...err("city")} />
        {msg("city")}
      </div>

      <fieldset className="ef-field" {...(errors.sites ? { "aria-describedby": "ef-sites-err" } : {})}>
        <legend>How many active sites do you run?</legend>
        <div className="ef-chips">
          {SITE_COUNTS.map((n) => (
            <label key={n} className="ef-chip">
              <input type="radio" name="sites" value={n} required defaultChecked={values?.sites === n} />
              <span>{n}</span>
            </label>
          ))}
        </div>
        {msg("sites")}
      </fieldset>

      <div className="ef-field">
        <label htmlFor="ef-company">
          Company name <span className="ef-opt">(optional)</span>
        </label>
        <input id="ef-company" name="company" autoComplete="organization" maxLength={100} defaultValue={values?.company} {...err("company")} />
        {msg("company")}
      </div>

      <fieldset className="ef-field">
        <legend>
          How should we reach you? <span className="ef-opt">(optional)</span>
        </legend>
        <div className="ef-chips">
          {CONTACT_WAYS.map((w) => (
            <label key={w} className="ef-chip">
              <input
                type="radio"
                name="contact"
                value={w}
                defaultChecked={(values?.contact || "whatsapp") === w}
              />
              <span>{w === "call" ? "Phone call" : "WhatsApp"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* For bots only: people never see or fill these. */}
      <div className="ef-trap" aria-hidden="true">
        <label htmlFor="ef-website">Website</label>
        <input id="ef-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="started" value={started} />

      <button type="submit" className="lp-pill lp-pill-red ef-submit" disabled={pending}>
        {pending ? "Sending…" : "Book my demo →"}
      </button>
      <p className="ef-fine">
        We use these details only to contact you about Alarsio. No email needed, no spam.
      </p>
    </form>
  );
}
