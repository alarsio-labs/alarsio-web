import { describe, expect, it } from "vitest";
import { CTA, DAY_RECORD, FAQ, FEATURES, HEATMAP, HERO, MARQUEE, PROBLEMS, ROLES, STEPS, TRUST } from "./content";

const ALL = { HERO, MARQUEE, PROBLEMS, FEATURES, ROLES, STEPS, DAY_RECORD, HEATMAP, TRUST, FAQ, CTA };

describe("home page content", () => {
  it("has six features, five steps, three problems and one card per role, in order", () => {
    expect(FEATURES.items).toHaveLength(6);
    expect(STEPS.items).toHaveLength(5);
    expect(PROBLEMS.items).toHaveLength(3);
    expect(ROLES.cards.map((r) => r.role)).toEqual(["Owner", "Project manager", "Supervisor", "Accountant"]);
  });

  it("keeps the four facts the sign-in pages show", () => {
    expect(HERO.meta).toEqual(["Offline first", "2 to 20 sites", "Android and web", "For Indian contractors"]);
  });

  it("gives the day record one value per phase for every row and cue", () => {
    const phases = DAY_RECORD.status.length;
    expect(phases).toBe(4);
    expect(DAY_RECORD.cues).toHaveLength(phases);
    for (const row of DAY_RECORD.rows) expect(row.values).toHaveLength(phases);
  });

  it("reads 'pending' on the server row until the record is sent", () => {
    const server = DAY_RECORD.rows.find((r) => r.label === "Server");
    expect(server?.values[0]).toBe("pending");
    expect(server?.values[1]).toBe("on the server");
  });

  it("uses the phone's own status words, in order", () => {
    expect(DAY_RECORD.status.slice(0, 3)).toEqual(["Saved on this phone, waiting to send", "Sending…", "On the server"]);
  });

  it("sends every button to a page on this site", () => {
    expect(CTA.primary.href).toBe("/demo");
    expect(CTA.pilot.href).toBe("/sign-up");
    expect(CTA.secondary.href).toBe("/sign-in");
    expect(CTA.download.href).toBe("/download");
    for (const r of ROLES.cards) expect(r.cta.href).toMatch(/^\/(demo|sign-up|sign-in|download)$/);
  });

  it("says the pilot is free, and labels the sample data", () => {
    expect(CTA.note).toBe("Free during the pilot. No card needed.");
    expect(HERO.note.toLowerCase()).toContain("free during the pilot");
    expect(HEATMAP.caption.toLowerCase()).toContain("sample");
  });

  it("makes no audit-log claim, never claims a record is submitted, and quotes no price", () => {
    const words = JSON.stringify(ALL).toLowerCase();
    expect(words).not.toContain("audit log");
    expect(words).not.toContain("submitted");
    expect(words).not.toMatch(/₹|rs\.|per month|\/month/);
  });

  it("has a question for each common worry, each asked once", () => {
    const qs = FAQ.map((f) => f.q);
    expect(new Set(qs).size).toBe(qs.length);
    expect(qs.length).toBeGreaterThanOrEqual(8);
  });
});
