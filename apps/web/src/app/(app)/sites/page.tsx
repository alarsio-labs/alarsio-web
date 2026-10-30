import Link from "next/link";
import { messageFor } from "@/lib/messages";
import { Notice } from "@/components/form";
import { toSiteRecord, type SiteRecord } from "@/lib/sites/rows";
import { requireSiteManager } from "./guard";

const LIMIT = 500;

const STATUS_TONE: Record<SiteRecord["status"], string> = {
  planned: "bg-neutral-100 text-neutral-800",
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-neutral-200 text-neutral-600"
};

function SiteList({ org, sites }: { org: string; sites: SiteRecord[] }) {
  return (
    <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200">
      {sites.map((s) => (
        <li key={s.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
          <span>
            <Link href={`/sites/${s.id}?org=${org}`} className="font-medium underline">{s.name}</Link>
            <span className="mt-0.5 block text-neutral-600">{s.address}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_TONE[s.status]}`}>{s.status}</span>
            <span className="text-xs text-neutral-500">{s.geofence_radius_m} m radius</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function SitesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { supabase, org } = await requireSiteManager(params.org, (o) => `/sites?org=${o}`);

  // The Sites module reads its own table. RLS (has_site_access) shows an owner
  // or project manager every site of the organisation, archived ones included.
  const { data, error: readError } = await supabase
    .from("sites")
    .select("id, name, address, status, latitude, longitude, geofence_radius_m, archived_at")
    .eq("org_id", org)
    .order("name")
    .limit(LIMIT);

  const raw: unknown[] = Array.isArray(data) ? data : [];
  const all = raw.map(toSiteRecord).filter((s): s is SiteRecord => s !== null);
  const dropped = raw.length - all.length;
  const live = all.filter((s) => s.status !== "archived");
  const archived = all.filter((s) => s.status === "archived");

  const error = messageFor(params.error) ?? (readError ? messageFor("generic") : null);
  const notice = params.archived === "1" ? "Site archived." : params.saved === "1" ? "Saved." : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mt-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Sites</h1>
        <Link href={`/sites/new?org=${org}`} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700">
          New site
        </Link>
      </div>

      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}
      {notice && !error && <div className="mt-6"><Notice kind="info">{notice}</Notice></div>}
      {dropped > 0 && (
        <div className="mt-6">
          <Notice kind="error">Some sites could not be shown. Reload, and tell the team if this stays.</Notice>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Sites ({live.length})</h2>
        {live.length === 0 ? (
          // A failed read says so in the notice above; it must not read as an empty organisation.
          !readError && <p className="mt-2 text-sm text-neutral-600">No sites yet. Create the first one.</p>
        ) : (
          <SiteList org={org} sites={live} />
        )}
      </section>

      {archived.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Archived ({archived.length})</h2>
          <p className="mt-1 text-sm text-neutral-600">Archived sites are read-only and keep their history.</p>
          <SiteList org={org} sites={archived} />
        </section>
      )}

      {raw.length >= LIMIT && <p className="mt-4 text-sm text-neutral-600">Showing the first {LIMIT} sites.</p>}
    </main>
  );
}
