import type { Flag } from "./list";
import type { DayStatus, EntryStatus, ExceptionKind, Hours, ReviewStatus } from "./rows";

// Fixed text for every enum the pages show, so nothing from the database is
// printed as a label.
export const FLAG_LABEL: Record<Flag, string> = {
  geofence_check_in: "Checked in outside the geofence",
  geofence_check_out: "Checked out outside the geofence",
  visit_not_closed: "A visit was not checked out",
  correction_pending: "Correction waiting",
  fixed_since_rejection: "Edited since it was sent back"
};

export const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  geofence_check_in: FLAG_LABEL.geofence_check_in,
  geofence_check_out: FLAG_LABEL.geofence_check_out,
  visit_not_closed: FLAG_LABEL.visit_not_closed,
  correction_pending: FLAG_LABEL.correction_pending,
  day_awaiting_review: "Day waiting for review",
  day_rejected: "Day was sent back"
};

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half day",
  leave: "Leave"
};

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  open: "Not reviewed",
  approved: "Approved",
  rejected: "Rejected"
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected"
};

export const hoursLabel = (h: Hours): string => `${Number(h)} h`;
