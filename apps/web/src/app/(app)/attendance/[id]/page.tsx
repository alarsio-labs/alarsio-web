import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { isSiteRow, rows } from "@/lib/reports/rows";
import {
  DAY_STATUS_LABEL,
  ENTRY_STATUS_LABEL,
  EXCEPTION_LABEL,
  REVIEW_STATUS_LABEL,
  hoursLabel
} from "@/lib/attendance/labels";
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
import { Notice } from "@/components/form";
import { reviewCorrection, reviewDay } from "./actions";
import { ReviewForm } from "./review-form";

const text = (v: string | null) => (v && v.trim() ? v : "–");

function Change({ title, status, hours, note }: { title: string; status: EntryRow["status"]; hours: EntryRow["overtime_hours"]; note: string | null }) {
  return (
    <div className="text-sm">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{title}</p>
      <p className="mt-1">{ENTRY_STATUS_LABEL[status]} · {hoursLabel(hours)}</p>
      <p className="whitespace-pre-wrap text-neutral-600">Note: {text(note)}</p>
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
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href={`/attendance?org=${org}`} className="app-back">← Attendance</Link>
      <h1 className="mt-4 text-2xl font-semibold">{site?.name ?? "Site"} · {day.attendance_date}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {DAY_STATUS_LABEL[day.status]} · {entries.length} {entries.length === 1 ? "entry" : "entries"}
        {day.recorded_by === user.id && " · opened by you"}
      </p>

      {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}

      {day.reviewed_at && (
        <section className="mt-6 rounded-md border border-neutral-200 p-4 text-sm">
          <h2 className="font-medium">{day.status === "approved" ? "Approved" : "Sent back"}</h2>
          <p className="mt-1 text-neutral-600">{istStamp(day.reviewed_at)}</p>
          <p className="mt-2 whitespace-pre-wrap">{day.review_reason ?? "No note."}</p>
        </section>
      )}

      {showDayReview && (
        <section className="mt-6 rounded-md border border-neutral-200 p-4">
          <h2 className="font-medium">Review this day</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Approving sends it to wages. Rejecting sends it back to the supervisor and needs a reason.
          </p>
          <ReviewForm action={reviewDay} fields={{ day_id: day.id, org_id: org }} label="Reason (needed to reject, optional to approve)" />
        </section>
      )}
      {mayReview && ownDay && (day.status === "open" || day.status === "rejected") && (
        <div className="mt-6"><Notice kind="info">You recorded this day, so someone else must review it.</Notice></div>
      )}

      {exceptions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Exceptions</h2>
          <ul className="mt-3 space-y-2">
            {exceptions.map((e) => (
              <li key={`${e.kind}:${e.source_id}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">{EXCEPTION_LABEL[e.kind]}</p>
                {e.distance_m !== null && <p>{Math.round(Number(e.distance_m))} m from the site pin</p>}
                {e.reason && <p className="whitespace-pre-wrap">Reason: {e.reason}</p>}
                {e.kind === "day_rejected" && e.changed_since_review === true && <p>Entries were edited after it was sent back.</p>}
                {e.worker_id && <p>Worker: {who(e.worker_id)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Entries</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No entries recorded.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr><th className="py-1 pr-3">Worker</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3">Overtime</th><th className="py-1">Note</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3">{who(e.worker_id)}</td>
                  <td className="py-2 pr-3">{ENTRY_STATUS_LABEL[e.status]}</td>
                  <td className="py-2 pr-3">{hoursLabel(e.overtime_hours)}</td>
                  <td className="whitespace-pre-wrap py-2">{text(e.note)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Corrections</h2>
        {corrections.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No corrections.</p>
        ) : (
          <ol className="mt-3 space-y-4">
            {corrections.map((c) => (
              <li key={c.id} className="rounded-md border border-neutral-200 p-4 text-sm">
                <p className="font-medium">
                  {who(c.worker_id)} · {REVIEW_STATUS_LABEL[c.review_status]}
                  {c.proposed_by === user.id && " · proposed by you"}
                </p>
                <p className="mt-1 text-neutral-600">Proposed {istStamp(c.created_at)}</p>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <Change title="Before" status={c.old_status} hours={c.old_overtime_hours} note={c.old_note} />
                  <Change title="Proposed" status={c.new_status} hours={c.new_overtime_hours} note={c.new_note} />
                </div>
                <p className="mt-3 whitespace-pre-wrap">Reason: {c.reason}</p>
                {c.reviewed_at && (
                  <p className="mt-2 text-neutral-600">
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
      </section>
    </main>
  );
}
