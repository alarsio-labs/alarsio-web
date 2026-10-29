import { describe, expect, it } from "vitest";
import { CTA, DAY_TABS, FAQ, HERO, NAV, type SectionId } from "./content";

// The ids the page renders as section anchors. A nav link to any other id goes nowhere.
const RENDERED: SectionId[] = ["how-it-works", "offline", "office", "faq"];

describe("landing content", () => {
  it("links every nav item to a section the page renders, once each", () => {
    const targets = NAV.map((n) => n.href.slice(1));
    expect(new Set(targets).size).toBe(targets.length);
    for (const t of targets) expect(RENDERED).toContain(t);
  });

  it("keeps the hero to three headline lines and at most four ticks (DESIGN.md)", () => {
    expect(HERO.headline).toHaveLength(3);
    expect(HERO.ticks.length).toBeLessThanOrEqual(4);
  });

  it("gives every day tab a unique id", () => {
    const ids = DAY_TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sends the pilot button to sign-up and the second one to sign-in, both on this site", () => {
    expect(CTA.primary.href).toBe("/sign-up");
    expect(CTA.secondary.href).toBe("/sign-in");
  });

  it("never claims a record is submitted, only that it is on the server", () => {
    const words = JSON.stringify({ HERO, DAY_TABS, FAQ }).toLowerCase();
    expect(words).not.toContain("submitted");
  });
});
