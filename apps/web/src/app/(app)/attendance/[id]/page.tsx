import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { isSiteRow, rows } from "@/lib/reports/rows";
import { ENTRY_STATUS_LABEL, EXCEPTION_LABEL, hoursLabel } from "@/lib/attendance/labels";
import { correctionTag, dayTag } from "@/lib/attendance/screen";
import { eyebrowFor } from "@/lib/app/dates";
import { canReviewCorrection, canReviewDay, recordedByViewer } from "@/lib/attendance/review";
import { istStamp } from "@/lib/attendance/time";
import {
  isCorrectionRow,
  isDayRow,
  isEntryRow,
  isExceptionRow,
  isWorkerRow,
  type CorrectionRow,
  type EntryRow
} from "@/lib/attendance/rows";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { reviewCorrection, reviewDay } from "./actions";
import { ReviewForm } from "./review-form";

const text = (v: string | null) => (v && v.trim() ? v : "–");

function Change({ title, status, hours, note }: { title: string; status: EntryRow["status"]; hours: EntryRow["overtime_hours"]; note: string | null }) {
  return (
    <div className="at-change">
      <p className="ax-eyebrow">{title}</p>
      <p>{ENTRY_STATUS_LABEL[status]} · {hoursLabel(hours)}</p>
      <p className="whitespace-pre-wrap ax-empty">Note: {text(note)}</p>
    </div>
  );
}

export default async function AttendanceDayPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const org = query.org;
  if (!UUID.test(id) || typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/attendance/${id}?org=${org}`)}`);

  const { data: dayData } = await supabase
    .from("attendance_days")
    .select("id, site_id, attendance_date, status, recorded_by, reviewed_at, review_reason")
    .eq("id", id)
    .eq("org_id", org)
    .maybeSingle();
  // RLS hides another organisation's day and a site the caller cannot see, both
  // as no row.
  if (!isDayRow(dayData)) redirect(`/attendance?org=${org}`);
  const day = dayData;

  const [{ data: siteData }, { data: canReview }, { data: entryData }, { data: correctionData }, { data: exceptionData }] =
    await Promise.all([
      supabase.from("site_directory").select("id, name, status").eq("id", day.site_id).maybeSingle(),
      supabase.rpc("can_review_site", { p_site_id: day.site_id }),
      supabase
        .from("attendance_entries")
        .select("id, worker_id, status, overtime_hours, note, recorded_by")
        .eq("org_id", org)
        .eq("site_id", day.site_id)
        .eq("attendance_date", day.attendance_date)
        .order("created_at", { ascending: true }),
      supabase
        .from("attendance_corrections")
        .select(
          "id, worker_id, old_status, old_overtime_hours, old_note, new_status, new_overtime_hours, new_note, reason, proposed_by, created_at, review_status, reviewed_at, review_reason"
        )
        .eq("org_id", org)
        .eq("site_id", day.site_id)
        .eq("attendance_date", day.attendance_date)
        .order("created_at", { ascending: true }),
      supabase
        .from("site_exceptions")
        .select("site_id, exception_date, kind, source_id, worker_id, reason, distance_m, changed_since_review")
        .eq("org_id", org)
        .eq("site_id", day.site_id)
        .eq("exception_date", day.attendance_date)
    ]);

  const site = isSiteRow(siteData) ? siteData : null;
  const entries = rows(entryData, isEntryRow);
  const corrections: CorrectionRow[] = rows(correctionData, isCorrectionRow);
  // day_awaiting_review repeats the status line above.
  const exceptions = rows(exceptionData, isExceptionRow).filter((e) => e.kind !== "day_awaiting_review");

  // Worker names through Workforce's published roster view. It has one row per
  // assignment, so a worker may appear twice; one name is enough.
  const workerIds = [...new Set([...entries.map((e) => e.worker_id), ...corrections.map((c) => c.worker_id)])];
  const { data: workerData } =
    workerIds.length === 0
      ? { data: [] }
      : await supabase.from("worker_roster").select("worker_id, name").eq("org_id", org).in("worker_id", workerIds);
  const workerName = new Map(rows(workerData, isWorkerRow).map((w) => [w.worker_id, w.name]));
  const who = (workerId: string) => workerName.get(workerId) ?? "Worker";

  const mayReview = canReview === true;
  const entryRecorders = entries.map((e) => e.recorded_by);
  const ownDay = recordedByViewer({ dayRecordedBy: day.recorded_by, entryRecorders, viewerId: user.id });
  const showDayReview = canReviewDay({
    canReview: mayReview,
    status: day.status,
    dayRecordedBy: day.recorded_by,
    entryRecorders,
    viewerId: user.id
  });
  const error = messageFor(query.error);

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:py-10">
      <div>
        <Link href={`/attendance?org=${org}`} className="app-back">← Attendance</Link>
        <PageHead eyebrow={eyebrowFor(day.attendance_date)} title={site?.name ?? "Site"} />
        <p className="at-meta">
          <StatusTag>{dayTag(day.status)}</StatusTag>
          <span>{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
          {day.recorded_by === user.id && <span className="ax-empty">Opened by you</span>}
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      {day.reviewed_at && (
        <Card title={day.status === "approved" ? "Approved" : "Sent back"} id="at-reviewed">
          <p className="ax-empty">{istStamp(day.reviewed_at)}</p>
          <p className="mt-2 whitespace-pre-wrap">{day.review_reason ?? "No note."}</p>
        </Card>
      )}

      {showDayReview && (
        <Card title="Review this day" id="at-review">
          <p className="ax-empty">Approving sends it to wages. Rejecting sends it back to the supervisor and needs a reason.</p>
          <ReviewForm action={reviewDay} fields={{ day_id: day.id, org_id: org }} label="Reason (needed to reject, optional to approve)" />
        </Card>
      )}
      {mayReview && ownDay && (day.status === "open" || day.status === "rejected") && (
        <Notice kind="info">You recorded this day, so someone else must review it.</Notice>
      )}

      {exceptions.length > 0 && (
        <Card title="Exceptions" id="at-exceptions">
          <ul className="at-list">
            {exceptions.map((e) => (
              <li key={`${e.kind}:${e.source_id}`}>
                <StatusTag tone="action">{EXCEPTION_LABEL[e.kind]}</StatusTag>
                <div className="at-change mt-2">
                  {e.distance_m !== null && <p>{Math.round(Number(e.distance_m))} m from the site pin</p>}
                  {e.reason && <p className="whitespace-pre-wrap">Reason: {e.reason}</p>}
                  {e.kind === "day_rejected" && e.changed_since_review === true && <p>Entries were edited after it was sent back.</p>}
                  {e.worker_id && <p>Worker: {who(e.worker_id)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Entries" id="at-entries">
        {/* Scrolls inside its card on a phone with the worker pinned, so the page never scrolls sideways (#138). */}
        <DataTable<EntryRow>
          caption="Attendance entries"
          rows={entries}
          rowKey={(e) => e.id}
          minWidth={560}
          empty="No entries recorded."
          columns={[
            { key: "worker", label: "Worker", render: (e) => who(e.worker_id) },
            { key: "status", label: "Status", render: (e) => ENTRY_STATUS_LABEL[e.status] },
            { key: "overtime", label: "Overtime", numeric: true, render: (e) => hoursLabel(e.overtime_hours) },
            { key: "note", label: "Note", render: (e) => <span className="whitespace-pre-wrap">{text(e.note)}</span> }
          ]}
        />
      </Card>

      <Card title="Corrections" id="at-corrections">
        {corrections.length === 0 ? (
          <p className="ax-empty">No corrections.</p>
        ) : (
          <ol className="at-list">
            {corrections.map((c) => (
              <li key={c.id}>
                <p className="at-meta mt-0">
                  <strong>{who(c.worker_id)}</strong>
                  <StatusTag>{correctionTag(c.review_status)}</StatusTag>
                  {c.proposed_by === user.id && <span className="ax-empty">Proposed by you</span>}
                </p>
                <p className="mt-1 ax-empty">Proposed {istStamp(c.created_at)}</p>
                <div className="at-changes">
                  <Change title="Before" status={c.old_status} hours={c.old_overtime_hours} note={c.old_note} />
                  <Change title="Proposed" status={c.new_status} hours={c.new_overtime_hours} note={c.new_note} />
                </div>
                <p className="mt-3 whitespace-pre-wrap">Reason: {c.reason}</p>
                {c.reviewed_at && (
                  <p className="mt-2 ax-empty">
                    {c.review_status === "approved" ? "Approved" : "Rejected"} {istStamp(c.reviewed_at)}
                    {c.review_reason && ` · ${c.review_reason}`}
                  </p>
                )}
                {canReviewCorrection({ canReview: mayReview, reviewStatus: c.review_status, proposedBy: c.proposed_by, viewerId: user.id }) && (
                  <ReviewForm
                    action={reviewCorrection}
                    fields={{ correction_id: c.id, day_id: day.id, org_id: org }}
                    label="Reason (needed to reject, optional to approve)"
                  />
                )}
                {mayReview && c.review_status === "pending" && c.proposed_by === user.id && (
                  <div className="mt-3"><Notice kind="info">You proposed this correction, so someone else must review it.</Notice></div>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </main>
  );
}
