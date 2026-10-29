import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, parseOrgForm, timezoneOptions } from "./org-form";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("parseOrgForm", () => {
  it("refuses an empty, blank or over-120-character name", () => {
    expect(parseOrgForm(fd({}))).toEqual({ ok: false, code: "org_name" });
    expect(parseOrgForm(fd({ name: "   " }))).toEqual({ ok: false, code: "org_name" });
    expect(parseOrgForm(fd({ name: "x".repeat(121) }))).toEqual({ ok: false, code: "org_name" });
  });

  it("sends Asia/Kolkata when no timezone is chosen", () => {
    expect(parseOrgForm(fd({ name: "Patil Constructions" }))).toEqual({ ok: true, name: "Patil Constructions", timezone: "Asia/Kolkata" });
    expect(parseOrgForm(fd({ name: "Patil Constructions", timezone: " " }))).toMatchObject({ timezone: DEFAULT_TIMEZONE });
  });

  it("trims the name and keeps the chosen timezone, leaving its check to the database", () => {
    expect(parseOrgForm(fd({ name: "  Patil  ", timezone: "Asia/Dubai" }))).toEqual({ ok: true, name: "Patil", timezone: "Asia/Dubai" });
    expect(parseOrgForm(fd({ name: "Patil", timezone: "Mars/Olympus" }))).toMatchObject({ ok: true, timezone: "Mars/Olympus" });
  });

  it("accepts exactly 120 characters", () => {
    expect(parseOrgForm(fd({ name: "x".repeat(120) }))).toMatchObject({ ok: true });
  });
});

describe("timezoneOptions", () => {
  it("puts Asia/Kolkata first even when the runtime lists it as Asia/Calcutta, once", () => {
    const out = timezoneOptions(["Europe/London", "Asia/Calcutta", "Asia/Dubai"]);
    expect(out).toEqual(["Asia/Kolkata", "Asia/Dubai", "Europe/London"]);
  });

  it("uses current names for renamed zones", () => {
    expect(timezoneOptions(["Asia/Katmandu", "Europe/Kiev"])).toEqual(["Asia/Kolkata", "Asia/Kathmandu", "Europe/Kyiv"]);
  });
});
