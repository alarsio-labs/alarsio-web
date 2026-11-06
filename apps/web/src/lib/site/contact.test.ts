import { describe, expect, it } from "vitest";
import { displayPhone, whatsAppHref } from "./contact";

describe("whatsAppHref", () => {
  it("builds a wa.me link from a +91 number", () => {
    expect(whatsAppHref("+91 79772 39722")).toBe("https://wa.me/917977239722");
  });

  it("ignores spaces, dashes and brackets", () => {
    expect(whatsAppHref("(91) 79772-39722")).toBe("https://wa.me/917977239722");
  });

  it("returns null for a number that is too short or too long", () => {
    expect(whatsAppHref("12345")).toBeNull();
    expect(whatsAppHref("1234567890123456")).toBeNull();
  });

  it("returns null when it is empty or unset", () => {
    expect(whatsAppHref("")).toBeNull();
    expect(whatsAppHref(undefined)).toBeNull();
  });
});

describe("displayPhone", () => {
  it("groups an Indian number", () => {
    expect(displayPhone("917977239722")).toBe("+91 79772 39722");
    expect(displayPhone("91 7977239722")).toBe("+91 79772 39722");
  });

  it("leaves any other number as typed", () => {
    expect(displayPhone(" +44 20 7946 0958 ")).toBe("+44 20 7946 0958");
  });
});
