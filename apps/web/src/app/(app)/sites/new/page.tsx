import Link from "next/link";
import { messageFor } from "@/lib/messages";
import { Card } from "@/components/app/card";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { requireSiteManager } from "../guard";
import { SiteForm } from "../site-form";
import { createSite } from "../actions";

export default async function NewSitePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { org } = await requireSiteManager(params.org, (o) => `/sites/new?org=${o}`);
  const error = messageFor(params.error);

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:py-10">
      <div>
        <Link href={`/sites?org=${org}`} className="app-back">← Sites</Link>
        <PageHead eyebrow="Sites" title="New site" />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <Card>
        <p className="ax-empty">A new site starts as planned. You can change its status on the site&apos;s page.</p>
        <SiteForm action={createSite} org={org} submitLabel="Create site" />
      </Card>
    </main>
  );
}
