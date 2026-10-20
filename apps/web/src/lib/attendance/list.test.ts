import { describe, expect, it } from "vitest";
import { buildRows, filterRows, sortRows, type DayInput, type ExceptionInput } from "./list";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";

const d = (over: Partial<DayInput> & { id: string }): DayInput => ({ site_id: A, attendance_date: "2026-10-20", status: "open", ...over });
const x = (over: Partial<ExceptionInput> & { kind: ExceptionInput["kind"] }): ExceptionInput => ({
  site_id: A,
  exception_date: "2026-10-20",
  changed_since_review: null,
  ...over
});

describe("buildRows", () => {
  it("makes one row per site and date, with the day's id and status", () => {
    const rows = buildRows(
      [d({ id: "d1" }), d({ id: "d2", attendance_date: "2026-10-19", status: "approved" }), d({ id: "d3", site_id: B })],
      []
    );
    expect(rows.map((r) => [r.siteId, r.date, r.dayId, r.dayStatus].join("|")).sort()).toEqual(
      [`${A}|2026-10-19|d2|approved`, `${A}|2026-10-20|d1|open`, `${B}|2026-10-20|d3|open`].sort()
    );
  });

  it("makes an exception-only row, with no day id, for a flag with no day", () => {
    const rows = buildRows([], [x({ kind: "visit_not_closed" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dayId: null, dayStatus: null, flags: ["visit_not_closed"], needsReview: false });
  });

  it("still needs review for a waiting correction whose day is not in the list", () => {
    const rows = buildRows([], [x({ kind: "correction_pending" })]);
    expect(rows[0]).toMatchObject({ dayId: null, pendingCorrections: 1, needsReview: true });
  });

  it("does not make a row from the day-status exceptions alone", () => {
    expect(buildRows([], [x({ kind: "day_awaiting_review" }), x({ kind: "day_rejected" })])).toEqual([]);
  });

  it("collects each flag kind once, and counts pending corrections", () => {
    const rows = buildRows(
      [d({ id: "d1", status: "approved" })],
      [
        x({ kind: "geofence_check_in" }),
        x({ kind: "geofence_check_in" }),
        x({ kind: "correction_pending" }),
        x({ kind: "correction_pending" }),
        x({ kind: "day_awaiting_review" })
      ]
    );
    expect(rows[0]!.flags).toEqual(["geofence_check_in", "correction_pending"]);
    expect(rows[0]!.pendingCorrections).toBe(2);
  });

  it("marks a rejected day fixed when its day_rejected exception says it changed", () => {
    const fixed = buildRows([d({ id: "d1", status: "rejected" })], [x({ kind: "day_rejected", changed_since_review: true })]);
    const unfixed = buildRows([d({ id: "d1", status: "rejected" })], [x({ kind: "day_rejected", changed_since_review: false })]);
    expect(fixed[0]).toMatchObject({ changedSinceReview: true, needsReview: true });
    expect(fixed[0]!.flags).toContain("fixed_since_rejection");
    expect(unfixed[0]).toMatchObject({ changedSinceReview: false, needsReview: false });
    expect(unfixed[0]!.flags).not.toContain("fixed_since_rejection");
  });

  it("needs review for an open day and any pending correction, not for an approved day with only geofence flags", () => {
    const rows = buildRows(
      [
        d({ id: "open", site_id: A }),
        d({ id: "geo", site_id: B, status: "approved" }),
        d({ id: "pend", site_id: A, attendance_date: "2026-10-18", status: "approved" })
      ],
      [
        x({ kind: "geofence_check_out", site_id: B }),
        x({ kind: "visit_not_closed", site_id: B }),
        x({ kind: "correction_pending", exception_date: "2026-10-18" })
      ]
    );
    const by = Object.fromEntries(rows.map((r) => [r.dayId, r.needsReview]));
    expect(by).toEqual({ open: true, geo: false, pend: true });
  });
});

describe("filterRows", () => {
  const rows = buildRows(
    [
      d({ id: "o", site_id: A }),
      d({ id: "r", site_id: A, attendance_date: "2026-10-19", status: "rejected" }),
      d({ id: "a", site_id: A, attendance_date: "2026-10-18", status: "approved" })
    ],
    [x({ kind: "geofence_check_in", site_id: B })]
  );
  const ids = (s: Parameters<typeof filterRows>[1]) => filterRows(rows, s).map((r) => r.dayId ?? "none").sort();

  it("filters by day status", () => {
    expect(ids("open")).toEqual(["o"]);
    expect(ids("rejected")).toEqual(["r"]);
    expect(ids("approved")).toEqual(["a"]);
  });
  it("shows exception-only rows under all and nowhere else, since nothing on them can be cleared", () => {
    expect(ids("needs_review")).toEqual(["o"]);
    expect(ids("all")).toEqual(["a", "none", "o", "r"]);
  });
});

describe("sortRows", () => {
  const name = new Map([
    [A, "Alpha"],
    [B, "Beta"]
  ]);

  it("puts the newest date first", () => {
    const rows = buildRows([d({ id: "old", attendance_date: "2026-10-01" }), d({ id: "new", attendance_date: "2026-10-09" })], []);
    expect(sortRows(rows, name).map((r) => r.dayId)).toEqual(["new", "old"]);
  });

  it("orders flagged before unflagged on the same date", () => {
    const rows = buildRows([d({ id: "plain", site_id: A }), d({ id: "flagged", site_id: B })], [x({ kind: "geofence_check_in", site_id: B })]);
    expect(sortRows(rows, name).map((r) => r.dayId)).toEqual(["flagged", "plain"]);
  });

  it("then puts rows waiting for review before reviewed ones, then orders by site name", () => {
    const rows = buildRows(
      [
        d({ id: "approved-alpha", site_id: A, status: "approved" }),
        d({ id: "open-beta", site_id: B }),
        d({ id: "approved-beta", site_id: B, attendance_date: "2026-10-19", status: "approved" }),
        d({ id: "approved-alpha-19", site_id: A, attendance_date: "2026-10-19", status: "approved" })
      ],
      []
    );
    expect(sortRows(rows, name).map((r) => r.dayId)).toEqual(["open-beta", "approved-alpha", "approved-alpha-19", "approved-beta"]);
  });

  it("is the same order for the same input in any order", () => {
    const days = [
      d({ id: "3", site_id: A, attendance_date: "2026-10-02" }),
      d({ id: "1", site_id: B }),
      d({ id: "2", site_id: A }),
      d({ id: "4", site_id: B, attendance_date: "2026-10-02", status: "approved" })
    ];
    const one = sortRows(buildRows(days, []), name).map((r) => r.dayId);
    const two = sortRows(buildRows([...days].reverse(), []), name).map((r) => r.dayId);
    expect(one).toEqual(two);
  });
});
