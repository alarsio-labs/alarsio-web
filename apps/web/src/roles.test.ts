import { describe, expect, it } from "vitest";
import { APP_ROLES, isAppRole } from "@alarsio/types";

describe("app roles", () => {
  it("has exactly the four roles", () => {
    expect([...APP_ROLES]).toEqual(["owner", "project_manager", "supervisor", "accountant"]);
  });

  it("accepts a real role", () => {
    expect(isAppRole("supervisor")).toBe(true);
  });

  it("rejects the deferred roles and junk", () => {
    for (const bad of ["admin", "director", "site_engineer", "founder", "", null, 7]) {
      expect(isAppRole(bad)).toBe(false);
    }
  });
});
