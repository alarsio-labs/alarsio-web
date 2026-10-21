import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { canMarkReviewed, MAX_REVIEW_NOTE, MAX_SEND_BACK_REASON } from "@/lib/reports/review";
import { UUID, isPhotoRow, isReportRow, isRevisionRow, isSiteRow, rows } from "@/lib/reports/rows";
import { Notice, buttonClass, inputClass } from "@/components/form";
import { reviewReport, sendBackReport } from "./actions";

const PHOTO_URL_SECONDS = 300;

// "rejected" is shown as "Sent back" (ADR-042 D1). A draft never reaches this page.
const STATUS_LABEL: Record<string, string> = {
  submitted: "Not reviewed",
  rejected: "Sent back",
  reviewed: "Reviewed"
};

// The server's own time zone is not the viewer's, so say which one this is.
// Days are UTC throughout (ADR-025 W4).
const stamp = (iso: string) =>
  `${new Date(iso).toLocaleString("en-IN", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`;

function Block({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-neutral-700">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm">{text && text.trim() ? text : "–"}</p>
    </div>
  );
}

export default async function ReportPage({
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
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/reports/${id}?org=${org}`)}`);

  const { data: reportData } = await supabase
    .from("daily_reports")
    .select(
      "id, site_id, report_date, author_id, status, headcount, work_done, blockers, serious_blocker, safety_incident, next_day_plan, submitted_at, reviewed_at, review_note"
    )
    .eq("id", id)
    .eq("org_id", org)
    .maybeSingle();
  // RLS hides a draft, another organisation's report and a site the caller
  // cannot see, all the same way: as no row.
  if (!isReportRow(reportData)) redirect(`/reports?org=${org}`);
  const report = reportData;

  const [{ data: siteData }, { data: canReview }, { data: revData }, { data: photoData }] = await Promise.all([
    supabase.from("site_directory").select("id, name, status").eq("id", report.site_id).maybeSingle(),
    supabase.rpc("can_review_site", { p_site_id: report.site_id }),
    supabase
      .from("daily_report_revisions")
      .select(
        "id, revision_no, headcount, work_done, blockers, serious_blocker, safety_incident, next_day_plan, reason, edited_at, sent_back_reason, sent_back_at"
      )
      .eq("report_id", id)
      .order("revision_no", { ascending: true }),
    supabase.from("report_photos").select("id, storage_path, caption").eq("report_id", id).order("created_at", { ascending: true })
  ]);

  const site = isSiteRow(siteData) ? siteData : null;
  const revisions = rows(revData, isRevisionRow);
  const photos = rows(photoData, isPhotoRow);

  // Signed under the viewer's own session, so storage RLS applies. A file the
  // phone has not uploaded yet has no object, so it gets no URL.
  const signed = await Promise.all(
    photos.map(async (p) => {
      const { data, error } = await supabase.storage.from("report-photos").createSignedUrl(p.storage_path, PHOTO_URL_SECONDS);
      return { ...p, url: error ? null : (data?.signedUrl ?? null) };
    })
  );

  const error = messageFor(query.error);
  const showReview = canMarkReviewed({
    canReview: canReview === true,
    status: report.status,
    authorId: report.author_id,
    viewerId: user.id
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href={`/reports?org=${org}`} className="text-sm underline">← Daily reports</Link>
      <h1 className="mt-4 text-2xl font-semibold">{site?.name ?? "Site"} · {report.report_date}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {STATUS_LABEL[report.status] ?? "Not reviewed"} · {report.headcount ?? "–"} workers
        {report.author_id === user.id && " · filed by you"}
      </p>

      {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {report.serious_blocker && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Serious blocker</span>}
        {report.safety_incident && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Safety incident</span>}
      </div>

      <Block title="Work done" text={report.work_done} />
      <Block title="Blockers" text={report.blockers} />
      <Block title="Next-day plan" text={report.next_day_plan} />

      {report.reviewed_at && (
        <section
          className={`mt-6 rounded-md border p-4 text-sm ${report.status === "rejected" ? "border-amber-300 bg-amber-50" : "border-neutral-200"}`}
        >
          <h2 className="font-medium">{report.status === "rejected" ? "Sent back" : "Review"}</h2>
          <p className="mt-1 text-neutral-600">{stamp(report.reviewed_at)}</p>
          <p className="mt-2 whitespace-pre-wrap">{report.review_note ?? "No note."}</p>
          {report.status === "rejected" && report.author_id === user.id && (
            <p className="mt-2 text-neutral-700">Fix the report on your phone and give a reason to send it again.</p>
          )}
        </section>
      )}

      {showReview && (
        <form action={reviewReport} className="mt-6 space-y-3">
          <input type="hidden" name="report_id" value={report.id} />
          <input type="hidden" name="org_id" value={org} />
          <label className="block text-sm font-medium text-neutral-700">
            Review note (optional)
            <textarea name="note" maxLength={MAX_REVIEW_NOTE} rows={3} className={`${inputClass} mt-1`} />
          </label>
          <button type="submit" className={buttonClass}>Mark reviewed</button>
        </form>
      )}

      {showReview && (
        <form action={sendBackReport} className="mt-6 space-y-3 border-t border-neutral-200 pt-6">
          <input type="hidden" name="report_id" value={report.id} />
          <input type="hidden" name="org_id" value={org} />
          <label className="block text-sm font-medium text-neutral-700">
            Reason to send it back (required)
            <textarea name="reason" required maxLength={MAX_SEND_BACK_REASON} rows={3} className={`${inputClass} mt-1`} />
          </label>
          <p className="text-xs text-neutral-500">The author sees this reason, fixes the report and sends it again with a reason of their own.</p>
          <button type="submit" className="rounded-md border border-neutral-900 px-4 py-2 hover:bg-neutral-100">Send back</button>
        </form>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium">Photos</h2>
        {signed.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No photos.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {signed.map((p) => (
              <li key={p.id} className="text-sm">
                {p.url ? (
                  <img src={p.url} alt={p.caption ?? "Report photo"} className="w-full rounded-md border border-neutral-200" />
                ) : (
                  <div className="rounded-md border border-dashed border-neutral-300 p-6 text-neutral-500">Uploading from the phone</div>
                )}
                {p.caption && <p className="mt-1 text-neutral-600">{p.caption}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">History</h2>
        {revisions.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">Never edited after it was submitted.</p>
        ) : (
          <ol className="mt-3 space-y-4">
            {revisions.map((r) => (
              <li key={r.id} className="rounded-md border border-neutral-200 p-4 text-sm">
                <p className="font-medium">
                  Edit {r.revision_no} · {stamp(r.edited_at)}
                </p>
                {r.sent_back_reason && (
                  <p className="mt-1 text-neutral-600">
                    Answers the send-back{r.sent_back_at && ` of ${stamp(r.sent_back_at)}`}: {r.sent_back_reason}
                  </p>
                )}
                <p className="mt-1 text-neutral-600">Reason: {r.reason}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">Before this edit</p>
                <p className="mt-1">{r.headcount ?? "–"} workers{r.serious_blocker && " · serious blocker"}{r.safety_incident && " · safety incident"}</p>
                <Block title="Work done" text={r.work_done} />
                <Block title="Blockers" text={r.blockers} />
                <Block title="Next-day plan" text={r.next_day_plan} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
