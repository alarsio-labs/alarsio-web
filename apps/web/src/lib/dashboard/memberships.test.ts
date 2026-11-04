import { describe, expect, it } from "vitest";
import { homeFor, toMemberships, type Membership } from "./memberships";

const m = (role: Membership["role"], orgId = "org-1"): Membership => ({ orgId, orgName: "Patil", role });

describe("homeFor", () => {
  it("keeps a user with no organisation on the dashboard, for the create stepper", () => {
    expect(homeFor([])).toBeNull();
  });

  it("keeps a user with several organisations on the dashboard hub", () => {
    expect(homeFor([m("owner", "a"), m("accountant", "b")])).toBeNull();
  });

  it("sends a user with one organisation to their role's home in it", () => {
    expect(homeFor([m("owner")])).toBe("/overview?org=org-1");
    expect(homeFor([m("project_manager")])).toBe("/overview?org=org-1");
    expect(homeFor([m("accountant")])).toBe("/wages?org=org-1");
    expect(homeFor([m("supervisor")])).toBe("/reports?org=org-1");
  });

  it("puts the organisation id in the query safely", () => {
    expect(homeFor([m("owner", "a&b c")])).toBe("/overview?org=a%26b%20c");
  });
});

describe("toMemberships", () => {
  it("reads well-formed rows and skips a row with an unknown role or no organisation", () => {
    const rows = [
      { org_id: "o1", role: "owner", organizations: { name: "Patil" } },
      { org_id: "o2", role: "admin", organizations: { name: "X" } },
      { org_id: "o3", role: "supervisor", organizations: null }
    ];
    expect(toMemberships(rows)).toEqual([{ orgId: "o1", orgName: "Patil", role: "owner" }]);
    expect(toMemberships(null)).toEqual([]);
  });
});
