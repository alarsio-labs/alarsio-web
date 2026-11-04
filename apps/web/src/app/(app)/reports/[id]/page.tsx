import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { canMarkReviewed, MAX_REVIEW_NOTE, MAX_SEND_BACK_REASON } from "@/lib/reports/review";
import { UUID, isPhotoRow, isReportRow, isRevisionRow, isSiteRow, rows } from "@/lib/reports/rows";
import { inputClass } from "@/components/form";
import { Button } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { eyebrowFor } from "@/lib/app/dates";
import { reportTag } from "@/lib/reports/screen";
import { reviewReport, sendBackReport } from "./actions";

const PHOTO_URL_SECONDS = 300;

// The server's own time zone is not the viewer's, so say which one this is.
// Days are UTC throughout (ADR-025 W4).
const stamp = (iso: string) =>
  `${new Date(iso).toLocaleString("en-IN", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`;

function Block({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="at-change mt-4 first:mt-0">
      <h3 className="ax-eyebrow">{title}</h3>
      <p className="whitespace-pre-wrap">{text && text.trim() ? text : "–"}</p>
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

  // A draft never reaches this page.
  const tag = reportTag(report.status);

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:py-10">
      <div>
        <Link href={`/reports?org=${org}`} className="app-back">← Daily reports</Link>
        <PageHead eyebrow={eyebrowFor(report.report_date)} title={site?.name ?? "Site"} />
        <p className="at-meta">
          <StatusTag tone={tag.tone}>{tag.word}</StatusTag>
          {report.serious_blocker && <StatusTag tone="action">Serious blocker</StatusTag>}
          {report.safety_incident && <StatusTag tone="action">Safety incident</StatusTag>}
          <span>{report.headcount ?? "–"} workers</span>
          {report.author_id === user.id && <span className="ax-empty">Filed by you</span>}
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <Card title="Report" id="rp-report">
        <Block title="Work done" text={report.work_done} />
        <Block title="Blockers" text={report.blockers} />
        <Block title="Next-day plan" text={report.next_day_plan} />
      </Card>

      {report.reviewed_at && (
        <Card title={report.status === "rejected" ? "Sent back" : "Review"} id="rp-reviewed">
          <p className="ax-empty">{stamp(report.reviewed_at)}</p>
          <p className="mt-2 whitespace-pre-wrap">{report.review_note ?? "No note."}</p>
          {report.status === "rejected" && report.author_id === user.id && (
            <div className="mt-3"><Notice kind="info">Fix the report on your phone and give a reason to send it again.</Notice></div>
          )}
        </Card>
      )}

      {showReview && (
        <Card title="Review" id="rp-review">
          <form action={reviewReport} className="space-y-3">
            <input type="hidden" name="report_id" value={report.id} />
            <input type="hidden" name="org_id" value={org} />
            <label className="au-field-row">
              <span className="ax-eyebrow">Review note (optional)</span>
              <textarea name="note" maxLength={MAX_REVIEW_NOTE} rows={3} className={inputClass} />
            </label>
            <Button type="submit">Mark reviewed</Button>
          </form>

          <form action={sendBackReport} className="mt-6 space-y-3 border-t border-neutral-200 pt-6">
            <input type="hidden" name="report_id" value={report.id} />
            <input type="hidden" name="org_id" value={org} />
            <label className="au-field-row">
              <span className="ax-eyebrow">Reason to send it back (required)</span>
              <textarea name="reason" required maxLength={MAX_SEND_BACK_REASON} rows={3} className={inputClass} />
            </label>
            <p className="ax-empty">The author sees this reason, fixes the report and sends it again with a reason of their own.</p>
            <Button type="submit" variant="secondary">Send back</Button>
          </form>
        </Card>
      )}

      <Card title="Photos" id="rp-photos">
        {signed.length === 0 ? (
          <p className="ax-empty">No photos.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {signed.map((p) => (
              <li key={p.id}>
                {p.url ? (
                  <img src={p.url} alt={p.caption ?? "Report photo"} className="w-full border border-neutral-200" />
                ) : (
                  <div className="border border-dashed border-neutral-300 p-6 ax-empty">Uploading from the phone</div>
                )}
                {p.caption && <p className="mt-1 ax-empty">{p.caption}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="History" id="rp-history">
        {revisions.length === 0 ? (
          <p className="ax-empty">Never edited after it was submitted.</p>
        ) : (
          <ol className="at-list">
            {revisions.map((r) => (
              <li key={r.id}>
                <p className="font-semibold">Edit {r.revision_no} · {stamp(r.edited_at)}</p>
                {r.sent_back_reason && (
                  <p className="mt-1 ax-empty">
                    Answers the send-back{r.sent_back_at && ` of ${stamp(r.sent_back_at)}`}: {r.sent_back_reason}
                  </p>
                )}
                <p className="mt-1 ax-empty">Reason: {r.reason}</p>
                <p className="mt-3 ax-eyebrow">Before this edit</p>
                <p className="mt-1">{r.headcount ?? "–"} workers{r.serious_blocker && " · serious blocker"}{r.safety_incident && " · safety incident"}</p>
                <Block title="Work done" text={r.work_done} />
                <Block title="Blockers" text={r.blockers} />
                <Block title="Next-day plan" text={r.next_day_plan} />
              </li>
            ))}
          </ol>
        )}
      </Card>
    </main>
  );
}
