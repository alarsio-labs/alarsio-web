// What the owner data export reads (#76, ADR-026). One CSV per table, every
// column the client may read, in table order. Rows come from the owner's own
// RLS: this list decides the columns, never who may see a row.
//
// tables.test.ts compares this list with supabase/migrations, so a new table or
// column fails CI until it is added here or exempted with an ADR.

export type ExportTable = {
  table: string;
  // The column that holds the organisation: "id" on organizations itself,
  // null on profiles, which has no organisation and is readable only by its
  // own user.
  orgColumn: "org_id" | "id" | null;
  // First column is always id: the export pages by it.
  columns: readonly string[];
};

export const EXPORT_TABLES: readonly ExportTable[] = [
  // Identity & Access
  { table: "organizations", orgColumn: "id", columns: ["id", "name", "timezone", "currency", "created_by", "created_at"] },
  { table: "profiles", orgColumn: null, columns: ["id", "full_name", "created_at"] },
  { table: "memberships", orgColumn: "org_id", columns: ["id", "org_id", "user_id", "role", "created_at"] },
  {
    table: "invites",
    orgColumn: "org_id",
    columns: ["id", "org_id", "email", "role", "expires_at", "created_by", "created_at", "accepted_at", "accepted_by", "revoked_at", "revoked_by"]
  },
  // Sites
  {
    table: "sites",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "name", "address", "latitude", "longitude", "geofence_radius_m", "status",
      "created_by", "created_at", "updated_at", "archived_at", "archived_by"
    ]
  },
  {
    table: "site_assignments",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "user_id", "assigned_by", "assigned_at", "unassigned_at", "unassigned_by"]
  },
  // Workforce
  {
    table: "workers",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "code", "full_name", "phone", "trade", "pay_type", "status",
      "created_by", "created_at", "updated_at", "anonymized_at"
    ]
  },
  {
    table: "worker_site_assignments",
    orgColumn: "org_id",
    columns: ["id", "org_id", "worker_id", "site_id", "assigned_by", "assigned_at", "unassigned_at", "unassigned_by"]
  },
  {
    table: "worker_wage_rates",
    orgColumn: "org_id",
    columns: ["id", "org_id", "worker_id", "rate", "effective_from", "created_by", "created_at"]
  },
  // Attendance & Site Presence
  {
    table: "site_visits",
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
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "attendance_date", "recorded_by", "status",
      "reviewed_by", "reviewed_at", "review_reason", "created_at"
    ]
  },
  {
    table: "attendance_entries",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "attendance_date", "worker_id", "status", "overtime_hours", "note",
      "recorded_by", "created_at", "updated_at"
    ]
  },
  {
    table: "attendance_corrections",
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
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "report_date", "author_id", "status", "headcount", "work_done", "blockers",
      "serious_blocker", "safety_incident", "next_day_plan", "edit_reason", "submitted_at", "submitted_by",
      "reviewed_at", "reviewed_by", "review_note", "created_at", "updated_at"
    ]
  },
  {
    table: "daily_report_revisions",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "site_id", "report_id", "revision_no", "headcount", "work_done", "blockers",
      "serious_blocker", "safety_incident", "next_day_plan", "reason", "edited_by", "edited_at"
    ]
  },
  {
    table: "report_photos",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "report_id", "storage_path", "caption", "size_bytes", "content_type", "uploaded_by", "created_at"]
  },
  // Materials & Inventory
  {
    table: "materials",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "name", "unit", "low_stock_threshold", "created_by", "created_at", "updated_at"]
  },
  {
    table: "material_transactions",
    orgColumn: "org_id",
    columns: ["id", "org_id", "site_id", "material_id", "kind", "quantity", "reason", "occurred_on", "recorded_by", "created_at"]
  },
  // Wage Summaries
  {
    table: "wage_periods",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "period_type", "start_date", "end_date", "status", "calculated_at",
      "locked_at", "locked_by", "created_by", "created_at"
    ]
  },
  {
    table: "wage_lines",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "period_id", "worker_id", "pay_type", "payable_days", "overtime_hours", "rate_from", "rate_to",
      "pay_amount", "overtime_amount", "no_rate_days", "calculated_at"
    ]
  },
  {
    table: "wage_line_days",
    orgColumn: "org_id",
    columns: [
      "id", "org_id", "period_id", "worker_id", "site_id", "work_date", "status", "overtime_hours", "payable_days",
      "rate", "day_amount", "overtime_amount"
    ]
  },
  {
    table: "wage_adjustments",
    orgColumn: "org_id",
    columns: ["id", "org_id", "period_id", "worker_id", "amount", "reason", "created_by", "created_at"]
  },
  {
    table: "wage_period_reopens",
    orgColumn: "org_id",
    columns: ["id", "org_id", "period_id", "reopened_by", "reopened_at", "reason", "locked_at", "locked_by"]
  },
  // Audit, Retention & Guards (owner-only read policy, ADR-012)
  {
    table: "audit_log",
    orgColumn: "org_id",
    columns: ["id", "table_name", "row_id", "operation", "actor_id", "org_id", "old_data", "new_data", "occurred_at"]
  }
];

// Columns the client has no SELECT grant on. Selecting one fails the query.
export const WITHHELD_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  invites: ["token_hash"]
};

// Closed to every client role (ADR-012): RLS on, no policies, no grants.
export const EXPORT_EXEMPT: readonly string[] = ["purge_log", "rate_limit_counters"];
