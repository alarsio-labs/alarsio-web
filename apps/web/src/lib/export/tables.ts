// What the owner data export reads (#76, ADR-026). One CSV per table, every
// column the client may read, in table order. Rows come from the owner's own
// RLS: this list decides the columns, never who may see a row.
//
// tables.test.ts compares this list with supabase/migrations, so a new table or
// column fails CI until it is added here or exempted with an ADR.

export type ExportTable = {
  table: string;
  // The heading it sits under on the export page, and one plain line on what it holds.
  group: string;
  about: string;
  // The column that holds the organisation: "id" on organizations itself,
  // null on profiles, which has no organisation and is readable only by its
  // own user.
  orgColumn: "org_id" | "id" | null;
  // First column is always id: the export pages by it.
  columns: readonly string[];
};

export const EXPORT_TABLES: readonly ExportTable[] = [
  // Identity & Access
  {
    table: "organizations",
    group: "Identity & Access",
    about: "Your organisation: its name, time zone and currency.",
    orgColumn: "id",
    columns: ["id", "name", "timezone", "currency", "created_by", "created_at"]
  },
  {
    table: "profiles",
    group: "Identity & Access",
    about: "Your own sign-in profile. Other people's profiles are private to them.",
    orgColumn: null,
    columns: ["id", "full_name", "created_at"]
  },
  {
    table: "memberships",
    group: "Identity & Access",
    about: "Who belongs to the organisation, and their role.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "user_id", "role", "created_at"]
  },
  {
    table: "invites",
    group: "Identity & Access",
    about: "Invites to join: who was invited, the role, and whether it was accepted, revoked or expired.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "email", "role", "expires_at", "created_by", "created_at", "accepted_at", "accepted_by", "revoked_at", "revoked_by"]
  },
  // Sites
  {
    table: "sites",
    group: "Sites",
    about: "Your sites: address, map position, geofence radius and status.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "name", "address", "latitude", "longitude", "geofence_radius_m", "status",
      "created_by", "created_at", "updated_at", "archived_at", "archived_by"
    ]
  },
  {
    table: "site_assignments",
    group: "Sites",
    about: "Which team member is assigned to which site, and when.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "user_id", "assigned_by", "assigned_at", "unassigned_at", "unassigned_by"]
  },
  // Workforce
  {
    table: "workers",
    group: "Workforce",
    about: "Your workers: code, name, phone, trade and pay type.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "code", "full_name", "phone", "trade", "pay_type", "status",
      "created_by", "created_at", "updated_at", "anonymized_at"
    ]
  },
  {
    table: "worker_site_assignments",
    group: "Workforce",
    about: "Which worker was put on which site, and when.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "worker_id", "site_id", "assigned_by", "assigned_at", "unassigned_at", "unassigned_by"]
  },
  {
    table: "worker_wage_rates",
    group: "Workforce",
    about: "Each worker's daily or hourly rate, and the date it starts.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "worker_id", "rate", "effective_from", "created_by", "created_at"]
  },
  // Attendance & Site Presence
  {
    table: "site_visits",
    group: "Attendance",
    about: "Supervisor check-in and check-out at a site, with the distance from the site boundary.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "user_id",
      "check_in_at", "check_in_lat", "check_in_lng", "check_in_distance_m", "check_in_outside_geofence", "check_in_reason",
      "check_out_at", "check_out_lat", "check_out_lng", "check_out_distance_m", "check_out_outside_geofence", "check_out_reason",
      "created_at", "updated_at"
    ]
  },
  {
    table: "attendance_days",
    group: "Attendance",
    about: "One record for each site and day: who recorded it, and whether it was approved.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "attendance_date", "recorded_by", "status",
      "reviewed_by", "reviewed_at", "review_reason", "created_at"
    ]
  },
  {
    table: "attendance_entries",
    group: "Attendance",
    about: "Each worker's mark for a day, with overtime hours.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "attendance_date", "worker_id", "status", "overtime_hours", "note",
      "recorded_by", "created_at", "updated_at"
    ]
  },
  {
    table: "attendance_corrections",
    group: "Attendance",
    about: "Changes proposed to a marked day, with the reason and the review.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "attendance_date", "worker_id",
      "old_status", "old_overtime_hours", "old_note", "new_status", "new_overtime_hours", "new_note",
      "reason", "proposed_by", "created_at", "review_status", "reviewed_by", "reviewed_at", "review_reason"
    ]
  },
  // Daily Reporting
  {
    table: "daily_reports",
    group: "Daily reports",
    about: "The daily site report: work done, blockers, safety and the plan for the next day.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "report_date", "author_id", "status", "headcount", "work_done", "blockers",
      "serious_blocker", "safety_incident", "next_day_plan", "edit_reason", "submitted_at", "submitted_by",
      "reviewed_at", "reviewed_by", "review_note", "created_at", "updated_at"
    ]
  },
  {
    table: "daily_report_revisions",
    group: "Daily reports",
    about: "Earlier versions of a report, and the reason when it was sent back.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "report_id", "revision_no", "headcount", "work_done", "blockers",
      "serious_blocker", "safety_incident", "next_day_plan", "reason", "edited_by", "edited_at",
      "sent_back_reason", "sent_back_by", "sent_back_at"
    ]
  },
  {
    table: "report_photos",
    group: "Daily reports",
    about: "Photos attached to reports. The file names only, not the pictures.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "report_id", "storage_path", "caption", "size_bytes", "content_type", "uploaded_by", "created_at"]
  },
  // Materials & Inventory
  {
    table: "materials",
    group: "Materials",
    about: "The materials tracked at each site, with the unit and the low-stock level.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "name", "unit", "low_stock_threshold", "created_by", "created_at", "updated_at"]
  },
  {
    table: "material_transactions",
    group: "Materials",
    about: "Every receipt, use or adjustment of a material, one row each.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "material_id", "kind", "quantity", "reason", "occurred_on", "recorded_by", "created_at"]
  },
  // Worker advances (ADR-054)
  {
    table: "worker_advances",
    group: "Worker advances",
    about: "Money paid to a worker before pay day. Amounts are in paise (100 paise = ₹1).",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "worker_id", "paid_on", "amount_paise", "note", "reverses_id", "recorded_by", "created_at"]
  },
  // Site cash book (ADR-058)
  {
    table: "cash_entries",
    group: "Cash book",
    about: "Cash in and out of each site's cash box. Amounts are in paise (100 paise = ₹1).",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "entry_date", "category", "amount_paise", "note", "reverses_id", "recorded_by", "created_at"]
  },
  // Wage Summaries
  {
    table: "wage_periods",
    group: "Wages",
    about: "The wage periods, and whether each is open or locked.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "period_type", "start_date", "end_date", "status", "calculated_at",
      "locked_at", "locked_by", "created_by", "created_at"
    ]
  },
  {
    table: "wage_lines",
    group: "Wages",
    about: "Each worker's pay for a period: days, overtime and amounts.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "period_id", "worker_id", "pay_type", "payable_days", "overtime_hours", "rate_from", "rate_to",
      "pay_amount", "overtime_amount", "no_rate_days", "calculated_at"
    ]
  },
  {
    table: "wage_line_days",
    group: "Wages",
    about: "The day-by-day working behind each wage line.",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "period_id", "worker_id", "site_id", "work_date", "status", "overtime_hours", "payable_days",
      "rate", "day_amount", "overtime_amount", "payable_overtime_hours"
    ]
  },
  {
    table: "wage_adjustments",
    group: "Wages",
    about: "Additions or deductions on a wage period, with the reason.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "period_id", "worker_id", "amount", "reason", "created_by", "created_at"]
  },
  {
    table: "wage_period_reopens",
    group: "Wages",
    about: "A record of each time a locked wage period was reopened.",
    orgColumn: "org_id",
    columns: ["id", "org_id", "period_id", "reopened_by", "reopened_at", "reason", "locked_at", "locked_by"]
  },
  // Audit, Retention & Guards (owner-only read policy, ADR-012)
  {
    table: "audit_log",
    group: "Audit",
    about: "The change history: who changed which record, when, and the old and new values.",
    orgColumn: "org_id",
    columns: ["id", "table_name", "row_id", "operation", "actor_id", "org_id", "old_data", "new_data", "occurred_at"]
  }
];

// Columns the client has no SELECT grant on. Selecting one fails the query.
export const WITHHELD_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  invites: ["token_hash"]
};

// Closed to every client role (ADR-012): RLS on, no policies, no grants.
// staff_members (ADR-052) is closed the same way, and holds no organisation's data.
export const EXPORT_EXEMPT: readonly string[] = ["purge_log", "rate_limit_counters", "staff_members"];
