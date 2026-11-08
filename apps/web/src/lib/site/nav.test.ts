import { describe, expect, it } from "vitest";
import { ROLES, roleId } from "@/lib/landing/content";
import { FOOTER_COLUMNS, HEADER_ITEMS, MENU_LINKS, WHO_WE_SERVE, isNavGroup } from "./nav";

describe("roleId", () => {
  it("makes an anchor from the role's name", () => {
    expect(roleId("Owner")).toBe("role-owner");
    expect(roleId("Project manager")).toBe("role-project-manager");
    expect(roleId("  Site  Supervisor ")).toBe("role-site-supervisor");
  });

  it("gives every role card its own id", () => {
    const ids = ROLES.cards.map((c) => roleId(c.role));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Who we serve", () => {
  it("lists the four roles, once each, in the home page's order", () => {
    expect(WHO_WE_SERVE.map((l) => l.label)).toEqual(["Owners", "Project managers", "Supervisors", "Accountants"]);
  });

  it("links each role to its own card on the home page", () => {
    for (const [i, link] of WHO_WE_SERVE.entries()) {
      expect(link.href).toBe(`/#${roleId(ROLES.cards[i]!.role)}`);
    }
  });

  it("offers no role the app does not have (CLAUDE.md: four roles only)", () => {
    const allowed = ["Owner", "Project manager", "Supervisor", "Accountant"];
    expect(ROLES.cards.map((c) => c.role)).toEqual(allowed);
  });
});

describe("the header's entries", () => {
  it("has the group between How it works and Download app", () => {
    expect(HEADER_ITEMS.map((i) => i.label)).toEqual(["Features", "How it works", "Who we serve", "Download app", "About"]);
  });

  it("makes only Who we serve a group, and every other entry a plain link", () => {
    const groups = HEADER_ITEMS.filter(isNavGroup);
    expect(groups.map((g) => g.label)).toEqual(["Who we serve"]);
    for (const item of HEADER_ITEMS) if (!isNavGroup(item)) expect(item.href).toMatch(/^\//);
  });

  it("keeps the full-screen menu and the footer pointing at the roles section too", () => {
    expect(MENU_LINKS.some((l) => l.href === "/#roles")).toBe(true);
    expect(FOOTER_COLUMNS.flatMap((c) => c.links).some((l) => l.href === "/#roles")).toBe(true);
  });
});
