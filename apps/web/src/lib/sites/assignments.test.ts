import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  assignmentErrorCode,
  eligibleSupervisors,
  memberLabel,
  splitAssignments,
  toAssignmentRecord,
  toMemberName,
  utcDate,
  type AssignmentRecord,
  type MemberName
} from "./assignments";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const U3 = "00000000-0000-4000-8000-000000000003";
const U4 = "00000000-0000-4000-8000-000000000004";
const A1 = "a0000000-0000-4000-8000-000000000001";
const A2 = "a0000000-0000-4000-8000-000000000002";
const A3 = "a0000000-0000-4000-8000-000000000003";

const member = (over: Partial<MemberName> = {}): MemberName => ({
  user_id: U1,
  full_name: "Asha Rao",
  role: "supervisor",
  ...over
});

const row = (over: Partial<AssignmentRecord> = {}): AssignmentRecord => ({
  id: A1,
  user_id: U1,
  assigned_by: U3,
  assigned_at: "2026-10-01T09:00:00+00:00",
  unassigned_at: null,
  unassigned_by: null,
  ...over
});

describe("toMemberName", () => {
  it("accepts a member, with or without a name", () => {
    expect(toMemberName({ user_id: U1, full_name: "Asha Rao", role: "supervisor" })).toEqual(member());
    expect(toMemberName({ user_id: U1, full_name: null, role: "accountant" })).toEqual(
      member({ full_name: null, role: "accountant" })
    );
  });

  it("refuses anything that is not a member row", () => {
    for (const bad of [
      null,
      undefined,
      "x",
      7,
      {},
      { user_id: "nope", full_name: "A", role: "supervisor" },
      { user_id: U1, full_name: 5, role: "supervisor" },
      { user_id: U1, full_name: "A", role: "admin" },
      { user_id: U1, full_name: "A" }
    ]) {
      expect(toMemberName(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("toAssignmentRecord", () => {
  it("accepts an open and a closed assignment", () => {
    expect(toAssignmentRecord(row())).toEqual(row());
    const closed = row({ unassigned_at: "2026-10-05T09:00:00+00:00", unassigned_by: U4 });
    expect(toAssignmentRecord(closed)).toEqual(closed);
  });

  it("refuses a malformed row, and one that is half closed", () => {
    for (const bad of [
      null,
      "x",
      {},
      { ...row(), id: "nope" },
      { ...row(), user_id: 3 },
      { ...row(), assigned_at: null },
      { ...row(), unassigned_at: "2026-10-05T09:00:00+00:00", unassigned_by: null },
      { ...row(), unassigned_at: null, unassigned_by: U4 }
    ]) {
      expect(toAssignmentRecord(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("splitAssignments", () => {
  it("puts open rows first-assigned last, and closed rows most recently removed first", () => {
    const open1 = row({ id: A1, assigned_at: "2026-10-01T09:00:00+00:00" });
    const open2 = row({ id: A2, user_id: U2, assigned_at: "2026-10-03T09:00:00+00:00" });
    const old = row({ id: A3, unassigned_at: "2026-10-02T09:00:00+00:00", unassigned_by: U4 });
    const newer = row({
      id: "a0000000-0000-4000-8000-000000000004",
      unassigned_at: "2026-10-04T09:00:00+00:00",
      unassigned_by: U4
    });

    const { open, closed } = splitAssignments([old, open1, newer, open2]);

    expect(open.map((r) => r.id)).toEqual([A2, A1]);
    expect(closed.map((r) => r.id)).toEqual([newer.id, A3]);
  });

  it("returns two empty lists for no rows", () => {
    expect(splitAssignments([])).toEqual({ open: [], closed: [] });
  });
});

describe("memberLabel", () => {
  const members = [member(), member({ user_id: U2, full_name: null })];

  it("names a member, and says so when there is no name or no such member", () => {
    expect(memberLabel(members, U1)).toBe("Asha Rao");
    expect(memberLabel(members, U2)).toBe("Unnamed member");
    expect(memberLabel(members, U4)).toBe("Unknown member");
    expect(memberLabel([], U1)).toBe("Unknown member");
  });

  it("treats a blank name as no name", () => {
    expect(memberLabel([member({ full_name: "   " })], U1)).toBe("Unnamed member");
  });
});

describe("eligibleSupervisors", () => {
  it("offers supervisors only, and not one who already has an open assignment here", () => {
    const members = [
      member({ user_id: U1 }),
      member({ user_id: U2, role: "owner" }),
      member({ user_id: U3, role: "accountant" }),
      member({ user_id: U4, role: "project_manager" }),
      member({ user_id: "00000000-0000-4000-8000-000000000005" })
    ];
    const open = [row({ user_id: U1 })];

    expect(eligibleSupervisors(members, open).map((m) => m.user_id)).toEqual(["00000000-0000-4000-8000-000000000005"]);
  });

  it("keeps the order the database gave", () => {
    const a = member({ user_id: U2, full_name: "Zed" });
    const b = member({ user_id: U1, full_name: "Amy" });
    expect(eligibleSupervisors([a, b], [])).toEqual([a, b]);
  });

  it("is empty when there are no members", () => {
    expect(eligibleSupervisors([], [])).toEqual([]);
  });
});

describe("assignmentErrorCode", () => {
  it("maps only the answers a manager can act on", () => {
    expect(assignmentErrorCode("42501")).toBe("site_forbidden");
    expect(assignmentErrorCode("23505")).toBe("assign_exists");
    expect(assignmentErrorCode("55000")).toBe("assign_archived");
    expect(assignmentErrorCode("23503")).toBe("assign_member");
  });

  it("gives the generic message for anything else", () => {
    for (const code of ["XX000", "28000", "", undefined]) {
      expect(assignmentErrorCode(code), String(code)).toBe("generic");
    }
  });
});

describe("utcDate", () => {
  it("shows the UTC calendar date", () => {
    expect(utcDate("2026-10-27T10:00:00.123456+00:00")).toBe("2026-10-27");
    expect(utcDate("2026-10-27T23:30:00-05:00")).toBe("2026-10-28");
  });

  it("does not invent a date", () => {
    expect(utcDate("not a date")).toBe("an unknown date");
    expect(utcDate("")).toBe("an unknown date");
  });
});

describe("HISTORY_LIMIT", () => {
  it("is 200", () => {
    expect(HISTORY_LIMIT).toBe(200);
  });
});
