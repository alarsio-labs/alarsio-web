import { describe, expect, it } from "vitest";
import { isCorrectionRow, isDayRow, isEntryRow, isExceptionRow, isWorkerRow } from "./rows";

const day = { id: "d", site_id: "s", attendance_date: "2026-10-20", status: "open", recorded_by: "u", reviewed_at: null, review_reason: null };
const exception = {
  site_id: "s", exception_date: "2026-10-20", kind: "geofence_check_in", source_id: "v", worker_id: null,
  reason: "gate was shut", distance_m: 120.5, changed_since_review: null
};
const entry = { id: "e", worker_id: "w", status: "present", overtime_hours: 1.5, note: null, recorded_by: "u" };
const corr = {
  id: "c", worker_id: "w", old_status: "present", old_overtime_hours: 0, old_note: null, new_status: "absent", new_overtime_hours: 0,
  new_note: "n", reason: "r", proposed_by: "u", created_at: "2026-10-20T01:00:00Z", review_status: "pending", reviewed_at: null, review_reason: null
};

describe("row guards", () => {
  it("accept a good row", () => {
    expect(isDayRow(day)).toBe(true);
    expect(isExceptionRow(exception)).toBe(true);
    expect(isEntryRow(entry)).toBe(true);
    expect(isCorrectionRow(corr)).toBe(true);
    expect(isWorkerRow({ worker_id: "w", name: "Ravi" })).toBe(true);
  });
  it("refuse an unknown status or kind and a wrong type", () => {
    expect(isDayRow({ ...day, status: "paid" })).toBe(false);
    expect(isDayRow({ ...day, recorded_by: 5 })).toBe(false);
    expect(isDayRow(null)).toBe(false);
    expect(isExceptionRow({ ...exception, kind: "made_up" })).toBe(false);
    expect(isEntryRow({ ...entry, status: "late" })).toBe(false);
    expect(isCorrectionRow({ ...corr, review_status: "x" })).toBe(false);
    expect(isWorkerRow({ worker_id: "w" })).toBe(false);
  });
  it("take overtime as a number or a numeric string, as PostgREST may send either", () => {
    expect(isEntryRow({ ...entry, overtime_hours: "1.50" })).toBe(true);
    expect(isEntryRow({ ...entry, overtime_hours: "lots" })).toBe(false);
    expect(isCorrectionRow({ ...corr, old_overtime_hours: "2.00", new_overtime_hours: "0.00" })).toBe(true);
  });
});
