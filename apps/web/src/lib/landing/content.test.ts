import { describe, expect, it } from "vitest";
import { CTA, DAY_RECORD, FAQ, HERO, MANIFESTO, RAIL, ROLES, WAGES } from "./content";

describe("landing content", () => {
  it("has six rail cards, three wage chapters and one table row per role", () => {
    expect(RAIL.cards).toHaveLength(6);
    expect(WAGES.chapters).toHaveLength(3);
    expect(ROLES.rows.map((r) => r[0])).toEqual(["Owner", "Project manager", "Supervisor", "Accountant"]);
  });

  it("gives the day record one value per phase for every row, cue and status line", () => {
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

  it("sends the pilot button to sign-up and the second one to sign-in, both on this site", () => {
    expect(CTA.primary.href).toBe("/sign-up");
    expect(CTA.secondary.href).toBe("/sign-in");
  });

  it("never claims a record is submitted, and quotes no price", () => {
    const words = JSON.stringify({ HERO, MANIFESTO, RAIL, DAY_RECORD, WAGES, ROLES, FAQ, CTA }).toLowerCase();
    expect(words).not.toContain("submitted");
    expect(words).not.toMatch(/₹|rs\.|per month|\/month/);
  });
});
