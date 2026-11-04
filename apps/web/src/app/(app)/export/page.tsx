import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { EXPORT_TABLES } from "@/lib/export/tables";
import { ownedOrganization } from "@/lib/export/supabase";
import { buttonClass } from "@/components/form";
import { Card } from "@/components/app/card";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";

export default async function ExportPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const orgParam = typeof params.org === "string" ? params.org : "";

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/export?org=${orgParam}`)}`);

  // Owner only (#76). A non-owner and a non-member see the same page.
  const org = await ownedOrganization(supabase, orgParam);
  const error = messageFor(params.error);

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:py-10">
      {!org ? (
        <>
          <PageHead title="Export data" />
          <Notice kind="info">Export is not available for this organisation. Only its owner can export its data.</Notice>
        </>
      ) : (
        <>
          <PageHead eyebrow={org.name} title="Export data" />
          {error && <Notice kind="error">{error}</Notice>}

          <Card title="What is in the file" id="ex-tables">
            <p className="ax-empty">
              One ZIP file with a CSV for each kind of record below, and a manifest that counts the rows. It holds what you can
              see in Alarsio today. Photo files are not included; each photo&apos;s storage path is.
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {EXPORT_TABLES.map((t) => (
                <li key={t.table} className="ax-mono">{t.table}.csv</li>
              ))}
            </ul>
          </Card>

          <Card title="Download" id="ex-download">
            <form method="post" action="/export/download" className="max-w-xs">
              <input type="hidden" name="org" value={org.id} />
              <button type="submit" className={buttonClass}>Download</button>
              <p className="mt-2 ax-empty">Up to 5 exports an hour. Large organisations may take a minute.</p>
            </form>
          </Card>
        </>
      )}
    </main>
  );
}
