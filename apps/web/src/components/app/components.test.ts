import { createElement as h, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { orgLinks } from "@/lib/dashboard/links";
import { renderStatic as html } from "@/test-support/render";

// next/link needs the Next runtime; a plain <a> is enough to check what we draw.
vi.mock("next/link", () => ({
  default: (p: { href: string; className?: string; children?: ReactNode; "aria-current"?: string }) =>
    h("a", { href: p.href, className: p.className, "aria-current": p["aria-current"] }, p.children)
}));

const { Button, ButtonLink } = await import("./button");
const { DataTable } = await import("./data-table");
const { SidebarNav } = await import("./sidebar-nav");
const { AppTopBar } = await import("./app-top-bar");
const { StatCard, progressPercent } = await import("./stat-card");
const { StatusTag } = await import("./status-tag");

describe("StatCard", () => {
  it("stays ink at 0 even when it can alert", () => {
    const out = html(h(StatCard, { label: "To approve", value: 0, alertAbove0: true }));
    expect(out).not.toContain("ax-stat-alert");
  });

  it("turns red-deep above 0 only when asked to", () => {
    expect(html(h(StatCard, { label: "To approve", value: 3, alertAbove0: true }))).toContain("ax-stat-alert");
    expect(html(h(StatCard, { label: "Active sites", value: 3 }))).not.toContain("ax-stat-alert");
  });

  it("formats the number in the Indian style", () => {
    expect(html(h(StatCard, { label: "Workers", value: 125000 }))).toContain("1,25,000");
  });
});

describe("StatusTag", () => {
  it("takes its tone from the word", () => {
    expect(html(h(StatusTag, { children: "Sent back" }))).toContain("ax-tag-action");
    expect(html(h(StatusTag, { children: "Approved" }))).toContain("ax-tag-ink");
    expect(html(h(StatusTag, { children: "Draft" }))).toContain("ax-tag-muted");
  });

  it("lets the caller set the tone", () => {
    expect(html(h(StatusTag, { children: "3 pending", tone: "action" }))).toContain("ax-tag-action");
  });
});

describe("Button", () => {
  it("is primary by default, and a button that does not submit unless told to", () => {
    const out = html(h(Button, { children: "Approve" }));
    expect(out).toContain("ax-btn-primary");
    expect(out).toContain('type="button"');
  });

  it("draws a secondary outline and a full-width link", () => {
    expect(html(h(Button, { variant: "secondary", type: "submit", children: "Back" }))).toContain("ax-btn-secondary");
    expect(html(h(ButtonLink, { href: "/export", full: true, children: "Export data" }))).toContain("ax-btn-full");
  });
});

describe("SidebarNav", () => {
  const links = orgLinks("owner", "org-1");
  const current = links.find((l) => l.label === "Sites")?.path ?? null;

  it("marks only the current module", () => {
    const out = html(h(SidebarNav, { links, current }));
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("draws one link per page the role may open, each with its icon", () => {
    const out = html(h(SidebarNav, { links: orgLinks("accountant", "org-1"), current: null }));
    expect(out).toContain(">Workers<");
    expect(out).toContain(">Wages<");
    expect(out).not.toContain(">Overview<");
    expect(out.match(/<svg/g)).toHaveLength(2);
  });

  it("draws nothing when there are no links", () => {
    expect(html(h(SidebarNav, { links: [], current: null }))).toBe("");
  });
});

describe("AppTopBar", () => {
  const signOut = () => undefined;
  const links = orgLinks("owner", "org-1");
  const current = links.find((l) => l.label === "Sites")?.path ?? null;

  it("draws the modules as pills and again in the Menu, with the current one marked in each", () => {
    const out = html(h(AppTopBar, { orgName: "Shree Builders", roleLabel: "Owner", links, current, signOut }));
    expect(out).toContain('class="cx-pills"');
    expect(out).toContain('aria-label="Menu"');
    expect(out.match(/aria-current="page"/g)).toHaveLength(2);
    expect(out).toContain(">Shree Builders<");
  });

  it("keeps Sign out in the account menu, with or without an organisation", () => {
    const out = html(h(AppTopBar, { email: "owner@example.com", signOut }));
    expect(out).not.toContain('aria-label="Menu"');
    expect(out).toContain('aria-label="Account"');
    expect(out).toContain("Sign out");
    expect(out).toContain("owner@example.com");
  });
});

describe("SidebarNav pills", () => {
  it("marks only the current module and draws no icons", () => {
    const links = orgLinks("owner", "org-1");
    const out = html(h(SidebarNav, { links, current: links[0]?.path ?? null, variant: "pills" }));
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).not.toContain("<svg");
  });
});

describe("StatCard details", () => {
  it("draws the open link only with an href, and a bar only with something to measure", () => {
    const plain = html(h(StatCard, { label: "Active sites", value: 2 }));
    expect(plain).not.toContain("ax-stat-link");
    expect(plain).not.toContain("ax-meter");
    const full = html(h(StatCard, { label: "Active sites", value: 2, href: "/sites?org=o1", foot: "of 3 sites", progress: { value: 2, max: 3 } }));
    expect(full).toContain('href="/sites?org=o1"');
    expect(full).toContain("of 3 sites");
    expect(full).toContain("width:67%");
    expect(html(h(StatCard, { label: "x", value: 0, progress: { value: 0, max: 0 } }))).not.toContain("ax-meter");
  });

  it("keeps the bar inside 0 to 100 percent", () => {
    expect(progressPercent({ value: 5, max: 2 })).toBe(100);
    expect(progressPercent({ value: -1, max: 2 })).toBe(0);
    expect(progressPercent(undefined)).toBeNull();
  });
});

describe("DataTable", () => {
  type Row = { id: string; site: string; present: number };
  const rows: Row[] = [{ id: "1", site: "Baner", present: 18 }];
  const columns = [
    { key: "site", label: "Site", render: (r: Row) => r.site },
    { key: "present", label: "Present", numeric: true, render: (r: Row) => String(r.present) }
  ];

  it("gives every header a scope, and the first cell of each row a row header", () => {
    const out = html(h(DataTable<Row>, { caption: "Today by site", columns, rows, rowKey: (r) => r.id, empty: "No sites" }));
    expect(out.match(/scope="col"/g)).toHaveLength(2);
    expect(out).toContain('<th scope="row">Baner</th>');
    expect(out).toContain("<caption");
  });

  it("keeps a minimum width so columns do not squash", () => {
    const out = html(h(DataTable<Row>, { caption: "x", columns, rows, rowKey: (r) => r.id, empty: "", minWidth: 720 }));
    expect(out).toContain("min-width:720px");
  });

  it("shows the empty sentence instead of an empty table", () => {
    const out = html(h(DataTable<Row>, { caption: "x", columns, rows: [], rowKey: (r) => r.id, empty: "No sites yet." }));
    expect(out).toBe('<p class="ax-empty">No sites yet.</p>');
  });
});
