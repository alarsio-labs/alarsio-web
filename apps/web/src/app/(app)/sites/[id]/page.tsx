import Link from "next/link";
import { redirect } from "next/navigation";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { Notice, buttonClass, inputClass } from "@/components/form";
import { SITE_STATUSES, mapUrl } from "@/lib/sites/input";
import { toSiteRecord } from "@/lib/sites/rows";
import { requireSiteManager } from "../guard";
import { SiteForm } from "../site-form";
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

  const archived = site.status === "archived";
  const confirming = !archived && query.confirm === "archive";
  const error = messageFor(query.error);
  const saved = query.saved === "1";
  const map = mapUrl(site.latitude, site.longitude);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Link href={list} className="text-sm underline">← Sites</Link>
      <h1 className="mt-4 text-2xl font-semibold">{site.name}</h1>

      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}
      {saved && !error && <div className="mt-6"><Notice kind="info">Saved.</Notice></div>}

      {archived ? (
        <section className="mt-6">
          <Notice kind="info">
            This site was archived on {site.archived_at ? site.archived_at.slice(0, 10) : "an earlier date"} (UTC). It is
            read-only, and its history stays.
          </Notice>
          <dl className="mt-6 space-y-3 text-sm">
            <div><dt className="font-medium">Address</dt><dd className="text-neutral-700">{site.address}</dd></div>
            <div>
              <dt className="font-medium">Pin</dt>
              <dd className="text-neutral-700">
                {site.latitude}, {site.longitude}
                {map && (
                  <>
                    {" · "}
                    <a href={map} target="_blank" rel="noopener noreferrer" className="underline">Find on map</a>
                  </>
                )}
              </dd>
            </div>
            <div><dt className="font-medium">Geofence radius</dt><dd className="text-neutral-700">{site.geofence_radius_m} m</dd></div>
          </dl>
        </section>
      ) : confirming ? (
        <section className="mt-6 rounded-md border border-red-300 bg-red-50 p-4">
          <h2 className="text-lg font-medium text-red-900">Archive {site.name}?</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-900">
            <li>Every supervisor and accountant assigned to this site is taken off it, and loses access to it.</li>
            <li>The site becomes read-only. Its name stays taken.</li>
            <li>This cannot be undone. There is no unarchive.</li>
          </ul>
          <div className="mt-4 flex items-center gap-4">
            <form action={archiveSite}>
              <input type="hidden" name="org_id" value={org} />
              <input type="hidden" name="site_id" value={site.id} />
              <button type="submit" className="rounded-md bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800">
                Yes, archive this site
              </button>
            </form>
            <Link href={`/sites/${site.id}?org=${org}`} className="text-sm underline">Cancel</Link>
          </div>
        </section>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-lg font-medium">Status</h2>
            <form action={setSiteStatus} className="mt-3 flex items-end gap-3">
              <input type="hidden" name="org_id" value={org} />
              <input type="hidden" name="site_id" value={site.id} />
              <label className="flex-1 text-sm font-medium text-neutral-700">
                Status
                <select name="status" defaultValue={site.status} className={`${inputClass} mt-1`}>
                  {SITE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <button type="submit" className={`${buttonClass} w-auto`}>Change status</button>
            </form>
            <p className="mt-1 text-xs text-neutral-500">Planned, active, paused and completed can be changed in any order.</p>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-medium">Details</h2>
            {map && (
              <p className="mt-1 text-sm">
                <a href={map} target="_blank" rel="noopener noreferrer" className="underline">Find on map</a>
                <span className="text-neutral-500"> (opens Google Maps)</span>
              </p>
            )}
            <SiteForm action={updateSite} org={org} site={site} submitLabel="Save changes" />
          </section>

          <section className="mt-10 border-t border-neutral-200 pt-6">
            <h2 className="text-lg font-medium">Archive</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Archiving ends the site for good. You will be asked to confirm.
            </p>
            <Link href={`/sites/${site.id}?org=${org}&confirm=archive`} className="mt-3 inline-block text-sm text-red-700 underline">
              Archive this site
            </Link>
          </section>
        </>
      )}
    </main>
  );
}
