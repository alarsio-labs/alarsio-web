import { describe, expect, it } from "vitest";
import { orgLinks } from "./links";

const labels = (role: Parameters<typeof orgLinks>[0]) => orgLinks(role, "org-1").map((l) => l.label);

// The same rules the dashboard drew before the v2 restyle, role by role.
describe("orgLinks", () => {
  it("gives the owner every page, Team and Export included", () => {
    expect(labels("owner")).toEqual(["Overview", "Daily reports", "Attendance", "Sites", "Materials", "Workers", "Wages", "Team", "Export"]);
  });

  it("shows Export to the owner only (#135)", () => {
    for (const role of ["project_manager", "supervisor", "accountant"] as const) expect(labels(role)).not.toContain("Export");
  });

  it("gives a project manager everything except Wages and Team", () => {
    expect(labels("project_manager")).toEqual(["Overview", "Daily reports", "Attendance", "Sites", "Materials", "Workers"]);
  });

  it("gives a supervisor only Daily reports on the web", () => {
    expect(labels("supervisor")).toEqual(["Daily reports"]);
  });

  it("gives an accountant Workers and Wages, and no reports", () => {
    expect(labels("accountant")).toEqual(["Workers", "Wages"]);
  });

  it("puts the organisation on every link", () => {
    for (const l of orgLinks("owner", "b49e a&1")) expect(l.path).toMatch(/\?org=b49e%20a%261$/);
  });
});
