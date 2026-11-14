import { describe, expect, it } from "vitest";
import { SOCIAL_LINKS } from "./social";

describe("the social links", () => {
  it("lists LinkedIn, X and Instagram, in that order", () => {
    expect(SOCIAL_LINKS.map((l) => l.id)).toEqual(["linkedin", "x", "instagram"]);
  });

  it("points each one at Alarsio's own page", () => {
    const byId = Object.fromEntries(SOCIAL_LINKS.map((l) => [l.id, l.href]));
    expect(byId.linkedin).toBe("https://www.linkedin.com/company/alarsio");
    expect(byId.x).toBe("https://x.com/alarsiotech");
    expect(byId.instagram).toBe("https://www.instagram.com/alarsio.team");
  });

  it("uses https and carries no query string or fragment (no tracking ids)", () => {
    for (const l of SOCIAL_LINKS) {
      const url = new URL(l.href);
      expect(url.protocol).toBe("https:");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
    }
  });

  it("gives each link its own name, for screen readers", () => {
    const labels = SOCIAL_LINKS.map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(["LinkedIn", "X", "Instagram"]);
  });
});
