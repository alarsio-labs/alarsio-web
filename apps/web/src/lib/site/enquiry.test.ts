import { describe, expect, it } from "vitest";
import { checkEnquiry, enquiryEmail, indianMobile, looksLikeBot, MIN_FILL_MS, WHATSAPP_HELLO } from "./enquiry";
import { telHref, whatsAppMessageHref } from "./contact";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const GOOD = { name: "Ravi Kumar", mobile: "98765 43210", city: "Pune", sites: "2–5", company: "", contact: "" };

describe("indianMobile", () => {
  it("accepts 10 digits with +91, 91, 0 or nothing in front", () => {
    for (const raw of ["9876543210", "+91 98765 43210", "919876543210", "09876543210", "98765-43210"]) {
      expect(indianMobile(raw)).toBe("9876543210");
    }
  });

  it("rejects landlines, short numbers and numbers starting 0–5", () => {
    for (const raw of ["", "12345", "5876543210", "98765432", "98765432100"]) expect(indianMobile(raw)).toBeNull();
  });
});

describe("checkEnquiry", () => {
  it("accepts the four required answers and defaults the contact way to WhatsApp", () => {
    const r = checkEnquiry(form(GOOD));
    expect(r).toEqual({
      ok: true,
      enquiry: { name: "Ravi Kumar", mobile: "9876543210", city: "Pune", sites: "2–5", company: "", contact: "whatsapp" }
    });
  });

  it("keeps a phone-call choice", () => {
    const r = checkEnquiry(form({ ...GOOD, contact: "call" }));
    expect(r.ok && r.enquiry.contact).toBe("call");
  });

  it("names every missing required field", () => {
    const r = checkEnquiry(form({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["city", "mobile", "name", "sites"]);
  });

  it("rejects a bad mobile, an unknown site count and an over-long company", () => {
    const r = checkEnquiry(form({ ...GOOD, mobile: "12345", sites: "50", company: "x".repeat(101) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["company", "mobile", "sites"]);
  });

  it("trims and collapses spaces", () => {
    const r = checkEnquiry(form({ ...GOOD, name: "  Ravi   Kumar ", city: " Navi  Mumbai " }));
    expect(r.ok && [r.enquiry.name, r.enquiry.city]).toEqual(["Ravi Kumar", "Navi Mumbai"]);
  });
});

describe("looksLikeBot", () => {
  const now = 1_000_000;
  it("flags a filled hidden field", () => {
    expect(looksLikeBot(form({ website: "spam.example", started: String(now - 60_000) }), now)).toBe(true);
  });

  it("flags a form sent faster than a person can type", () => {
    expect(looksLikeBot(form({ website: "", started: String(now - MIN_FILL_MS + 1) }), now)).toBe(true);
  });

  it("lets a person through, with or without JavaScript", () => {
    expect(looksLikeBot(form({ website: "", started: String(now - 20_000) }), now)).toBe(false);
    expect(looksLikeBot(form({ website: "", started: "" }), now)).toBe(false);
  });
});

describe("enquiryEmail", () => {
  it("lists the answers with one-tap reply links and escapes HTML", () => {
    const r = checkEnquiry(form({ ...GOOD, company: "<b>Shree</b> & Co", contact: "call" }));
    if (!r.ok) throw new Error("expected ok");
    const mail = enquiryEmail(r.enquiry, new Date("2026-11-08T06:30:00Z"));
    expect(mail.subject).toBe("Demo enquiry: Ravi Kumar, Pune (2–5 sites)");
    expect(mail.text).toContain("Mobile: +91 98765 43210");
    expect(mail.text).toContain("Prefers: Call");
    expect(mail.text).toContain("https://wa.me/919876543210");
    expect(mail.text).toContain("tel:+919876543210");
    expect(mail.text).toContain("12:00 pm IST");
    expect(mail.html).toContain("&lt;b&gt;Shree&lt;/b&gt; &amp; Co");
    expect(mail.html).not.toContain("<b>Shree</b>");
  });
});

describe("contact links", () => {
  it("builds a tel: link with the country code", () => {
    expect(telHref("+91 79772 39722")).toBe("tel:+917977239722");
    expect(telHref("123")).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });

  it("prefills a WhatsApp message that carries none of the visitor's details", () => {
    expect(whatsAppMessageHref("917977239722", WHATSAPP_HELLO)).toBe(
      `https://wa.me/917977239722?text=${encodeURIComponent(WHATSAPP_HELLO)}`
    );
    expect(whatsAppMessageHref(undefined, WHATSAPP_HELLO)).toBeNull();
  });
});
