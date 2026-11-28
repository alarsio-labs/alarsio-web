import { describe, expect, it } from "vitest";
import { groupBySection, orgLinks } from "./links";

const labels = (role: Parameters<typeof orgLinks>[0]) => orgLinks(role, "org-1").map((l) => l.label);

// The same rules the dashboard drew before the v2 restyle, role by role.
describe("orgLinks", () => {
  it("gives the owner every page, Team and Export included", () => {
    expect(labels("owner")).toEqual(["Overview", "Daily reports", "Attendance", "Sites", "Materials", "Workers", "Wages", "Advances", "Team", "Export"]);
  });

  it("shows Export to the owner only (#135)", () => {
    for (const role of ["project_manager", "supervisor", "accountant"] as const) expect(labels(role)).not.toContain("Export");
  });

  it("gives a project manager everything except Wages and Team", () => {
    expect(labels("project_manager")).toEqual(["Overview", "Daily reports", "Attendance", "Sites", "Materials", "Workers"]);
  });

  it("gives a supervisor Daily reports and Advances on the web", () => {
    expect(labels("supervisor")).toEqual(["Daily reports", "Advances"]);
  });

  it("gives an accountant Workers, Wages and Advances, and no reports", () => {
    expect(labels("accountant")).toEqual(["Workers", "Wages", "Advances"]);
  });

  it("keeps Advances from a project manager, who cannot read them", () => {
    expect(labels("project_manager")).not.toContain("Advances");
  });

  it("groups the pages into the phone's tabs, and only those the role can use", () => {
    const tabs = (role: Parameters<typeof orgLinks>[0]) => groupBySection(orgLinks(role, "o")).map((g) => [g.section, g.links.map((l) => l.label)]);
    expect(tabs("owner")).toEqual([
      ["today", ["Overview", "Attendance"]],
      ["sites", ["Sites", "Materials", "Workers"]],
      ["reports", ["Daily reports", "Wages", "Advances", "Export"]],
      ["more", ["Team"]]
    ]);
    expect(tabs("supervisor")).toEqual([["reports", ["Daily reports", "Advances"]]]);
    expect(tabs("accountant")).toEqual([["sites", ["Workers"]], ["reports", ["Wages", "Advances"]]]);
  });

  it("puts the organisation on every link", () => {
    for (const l of orgLinks("owner", "b49e a&1")) expect(l.path).toMatch(/\?org=b49e%20a%261$/);
  });
});
