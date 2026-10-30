import Link from "next/link";
import { messageFor } from "@/lib/messages";
import { toSiteRecord, type SiteRecord } from "@/lib/sites/rows";
import { siteTag } from "@/lib/sites/screen";
import { ButtonLink } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { requireSiteManager } from "./guard";

const LIMIT = 500;

function SiteTable({ org, sites, caption }: { org: string; sites: SiteRecord[]; caption: string }) {
  return (
    <DataTable<SiteRecord>
      caption={caption}
      rows={sites}
      rowKey={(s) => s.id}
      minWidth={640}
      empty="None."
      columns={[
        { key: "name", label: "Site", render: (s) => <Link href={`/sites/${s.id}?org=${org}`} className="underline">{s.name}</Link> },
        { key: "address", label: "Address", render: (s) => s.address },
        { key: "status", label: "Status", render: (s) => { const t = siteTag(s.status); return <StatusTag tone={t.tone}>{t.word}</StatusTag>; } },
        { key: "radius", label: "Geofence", numeric: true, render: (s) => `${s.geofence_radius_m} m` }
      ]}
    />
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
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <PageHead eyebrow={`${live.length} ${live.length === 1 ? "site" : "sites"} · ${archived.length} archived`} title="Sites" action={<ButtonLink href={`/sites/new?org=${org}`}>New site</ButtonLink>} />

      {error && <Notice kind="error">{error}</Notice>}
      {notice && !error && <Notice kind="info">{notice}</Notice>}
      {dropped > 0 && <Notice kind="error">Some sites could not be shown. Reload, and tell the team if this stays.</Notice>}

      <Card title={`Sites (${live.length})`} id="si-live">
        {live.length === 0 ? (
          // A failed read says so in the notice above; it must not read as an empty organisation.
          !readError && <p className="ax-empty">No sites yet. Create the first one.</p>
        ) : (
          <SiteTable org={org} sites={live} caption="Sites" />
        )}
      </Card>

      {archived.length > 0 && (
        <Card title={`Archived (${archived.length})`} id="si-archived">
          <p className="ax-empty mb-3">Archived sites are read-only and keep their history.</p>
          <SiteTable org={org} sites={archived} caption="Archived sites" />
        </Card>
      )}

      {raw.length >= LIMIT && <p className="ax-empty">Showing the first {LIMIT} sites.</p>}
    </main>
  );
}
