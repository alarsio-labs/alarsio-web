import Link from "next/link";
import { messageFor } from "@/lib/messages";
import { Notice } from "@/components/form";
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
    <main className="mx-auto max-w-xl px-4 py-10">
      <Link href={`/sites?org=${org}`} className="app-back">← Sites</Link>
      <h1 className="mt-4 text-2xl font-semibold">New site</h1>
      <p className="mt-1 text-sm text-neutral-600">
        A new site starts as planned. You can change its status on the site&apos;s page.
      </p>
      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}
      <SiteForm action={createSite} org={org} submitLabel="Create site" />
    </main>
  );
}
