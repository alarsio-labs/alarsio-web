import Link from "next/link";
import { redirect } from "next/navigation";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { inputClass } from "@/components/form";
import { Button, ButtonLink } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { siteTag } from "@/lib/sites/screen";
import { SITE_STATUSES, mapUrl } from "@/lib/sites/input";
import { toSiteRecord } from "@/lib/sites/rows";
import { HISTORY_LIMIT, splitAssignments, toAssignmentRecord, toMemberName } from "@/lib/sites/assignments";
import { requireSiteManager } from "../guard";
import { SiteForm } from "../site-form";
import { Supervisors } from "./supervisors";
import { archiveSite, setSiteStatus, updateSite } from "../actions";

export default async function SitePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, org } = await requireSiteManager(query.org, (o) => `/sites/${id}?org=${o}`);
  const list = `/sites?org=${org}`;
  if (!UUID.test(id)) redirect(list);

  // Both the id and the organisation in the URL must match, so an id from
  // another organisation finds nothing; RLS would hide it anyway.
  const { data, error: readError } = await supabase
    .from("sites")
    .select("id, name, address, status, latitude, longitude, geofence_radius_m, archived_at")
    .eq("id", id)
    .eq("org_id", org)
    .maybeSingle();
  // A failed read is not "no such site": say so on the list.
  if (readError) redirect(`${list}&error=generic`);
  const site = toSiteRecord(data);
  if (!site) redirect(list);

  // The people on this site: names through Identity's published function (ADR-044),
  // the rows from the table Sites owns. A row that cannot be read is a failure, not a
  // gap; names that cannot be read leave the rows shown as "Unknown member".
  const [namesResult, rowsResult] = await Promise.all([
    supabase.rpc("org_member_names", { p_org_id: org }),
    supabase
      .from("site_assignments")
      .select("id, user_id, assigned_by, assigned_at, unassigned_at, unassigned_by")
      .eq("site_id", id)
      .eq("org_id", org)
      // Open rows first, then the most recently removed, so the cap drops only old
      // closed history and never an open assignment that still needs its Remove button.
      .order("unassigned_at", { ascending: false, nullsFirst: true })
      .limit(HISTORY_LIMIT)
  ]);
  if (rowsResult.error || !Array.isArray(rowsResult.data)) redirect(`${list}&error=generic`);
  const records = rowsResult.data.map(toAssignmentRecord);
  if (records.some((r) => r === null)) redirect(`${list}&error=generic`);
  const { open, closed } = splitAssignments(records.filter((r) => r !== null));
  const names = !namesResult.error && Array.isArray(namesResult.data) ? namesResult.data.map(toMemberName) : [null];
  const members = names.some((m) => m === null) ? null : names.filter((m) => m !== null);
  const capped = rowsResult.data.length >= HISTORY_LIMIT;

  const archived = site.status === "archived";
  const confirming = !archived && query.confirm === "archive";
  const error = messageFor(query.error);
  const saved = query.saved === "1";
  const map = mapUrl(site.latitude, site.longitude);

  const tag = siteTag(site.status);

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:py-10">
      <div>
        <Link href={list} className="app-back">← Sites</Link>
        <PageHead eyebrow="Site" title={site.name} />
        <p className="at-meta"><StatusTag tone={tag.tone}>{tag.word}</StatusTag><span>{site.geofence_radius_m} m geofence</span></p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {saved && !error && <Notice kind="info">Saved.</Notice>}

      {archived ? (
        <>
          <Notice kind="info">
            This site was archived on {site.archived_at ? site.archived_at.slice(0, 10) : "an earlier date"} (UTC). It is
            read-only, and its history stays.
          </Notice>
          <Card title="Details" id="si-details">
            <dl className="db-review">
              <div><dt className="ax-eyebrow">Address</dt><dd>{site.address}</dd></div>
              <div>
                <dt className="ax-eyebrow">Pin</dt>
                <dd>
                  {site.latitude}, {site.longitude}
                  {map && (
                    <>
                      {" · "}
                      <a href={map} target="_blank" rel="noopener noreferrer" className="underline">Find on map</a>
                    </>
                  )}
                </dd>
              </div>
              <div><dt className="ax-eyebrow">Geofence radius</dt><dd>{site.geofence_radius_m} m</dd></div>
            </dl>
          </Card>
          <Supervisors org={org} siteId={site.id} archived members={members} open={open} closed={closed} capped={capped} />
        </>
      ) : confirming ? (
        // A destructive action keeps its confirm step and the ordinary buttons: there is no red button.
        <Card title={`Archive ${site.name}?`} id="si-confirm">
          <Notice kind="error">This cannot be undone. There is no unarchive.</Notice>
          <ul className="mt-4 list-disc space-y-1 pl-5">
            <li>Every supervisor and accountant assigned to this site is taken off it, and loses access to it.</li>
            <li>The site becomes read-only. Its name stays taken.</li>
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form action={archiveSite}>
              <input type="hidden" name="org_id" value={org} />
              <input type="hidden" name="site_id" value={site.id} />
              <Button type="submit">Yes, archive this site</Button>
            </form>
            <ButtonLink href={`/sites/${site.id}?org=${org}`} variant="secondary">Cancel</ButtonLink>
          </div>
        </Card>
      ) : (
        <>
          <Card title="Status" id="si-status">
            <form action={setSiteStatus} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="org_id" value={org} />
              <input type="hidden" name="site_id" value={site.id} />
              <label className="au-field-row min-w-0 flex-1">
                <span className="ax-eyebrow">Status</span>
                <select name="status" defaultValue={site.status} className={inputClass}>
                  {SITE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <Button type="submit">Change status</Button>
            </form>
            <p className="mt-2 ax-empty">Planned, active, paused and completed can be changed in any order.</p>
          </Card>

          <Supervisors org={org} siteId={site.id} archived={false} members={members} open={open} closed={closed} capped={capped} />

          <Card title="Details" id="si-details">
            {map && (
              <p className="mb-2">
                <a href={map} target="_blank" rel="noopener noreferrer" className="underline">Find on map</a>
                <span className="ax-empty"> (opens Google Maps)</span>
              </p>
            )}
            <SiteForm action={updateSite} org={org} site={site} submitLabel="Save changes" />
          </Card>

          <Card title="Archive" id="si-archive">
            <p className="ax-empty">Archiving ends the site for good. You will be asked to confirm.</p>
            <div className="mt-3">
              <ButtonLink href={`/sites/${site.id}?org=${org}&confirm=archive`} variant="secondary">Archive this site</ButtonLink>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
