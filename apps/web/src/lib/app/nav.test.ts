import { describe, expect, it } from "vitest";
import { orgLinks } from "@/lib/dashboard/links";
import { activeLink } from "./nav";

const links = orgLinks("owner", "org-1");

describe("activeLink", () => {
  it("marks the tab whose page is open", () => {
    expect(activeLink(links, "/overview")?.label).toBe("Overview");
    expect(activeLink(links, "/wages")?.label).toBe("Wages");
  });

  it("keeps the module's tab on its detail pages", () => {
    expect(activeLink(links, "/sites/0fe85e14")?.label).toBe("Sites");
    expect(activeLink(links, "/sites/new")?.label).toBe("Sites");
    expect(activeLink(links, "/wages/period-1")?.label).toBe("Wages");
  });

  it("ignores the query string", () => {
    expect(activeLink(links, "/workers?org=org-1&page=2")?.label).toBe("Workers");
  });

  it("marks nothing on a page that is not a tab, or on a look-alike path", () => {
    expect(activeLink(links, "/dashboard")).toBeNull();
    expect(activeLink(links, "/sitesmap")).toBeNull();
  });

  it("only offers the role's own tabs", () => {
    expect(activeLink(orgLinks("accountant", "org-1"), "/overview")).toBeNull();
  });
});
