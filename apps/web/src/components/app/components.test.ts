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
const { ModuleTabs } = await import("./module-tabs");
const { StatCard } = await import("./stat-card");
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

describe("ModuleTabs", () => {
  const links = orgLinks("owner", "org-1");
  const current = links.find((l) => l.label === "Sites")?.path ?? null;

  it("marks only the current tab, in the row and in the phone menu", () => {
    const out = html(h(ModuleTabs, { links, current }));
    expect(out.match(/aria-current="page"/g)).toHaveLength(2);
    expect(out).toContain("Menu · Sites");
  });

  it("draws one tab per link the role may open", () => {
    const out = html(h(ModuleTabs, { links: orgLinks("accountant", "org-1"), current: null }));
    expect(out).toContain(">Workers<");
    expect(out).toContain(">Wages<");
    expect(out).not.toContain(">Overview<");
  });

  it("draws nothing when there are no links", () => {
    expect(html(h(ModuleTabs, { links: [], current: null }))).toBe("");
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
