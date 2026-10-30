import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { EXPORT_TABLES } from "@/lib/export/tables";
import { ownedOrganization } from "@/lib/export/supabase";
import { Notice, buttonClass } from "@/components/form";

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
    <main className="mx-auto max-w-2xl px-4 py-10">

      {!org ? (
        <div className="mt-6">
          <Notice kind="info">Export is not available for this organisation. Only its owner can export its data.</Notice>
        </div>
      ) : (
        <>
          <h1 className="mt-4 text-2xl font-semibold">{org.name} · Export data</h1>
          <p className="mt-2 text-sm text-neutral-600">
            One ZIP file with a CSV for each kind of record below, and a manifest that counts the rows.
            It holds what you can see in Alarsio today. Photo files are not included; each photo&apos;s
            storage path is.
          </p>

          {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}

          <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-neutral-700 sm:grid-cols-2">
            {EXPORT_TABLES.map((t) => (
              <li key={t.table} className="font-mono">{t.table}.csv</li>
            ))}
          </ul>

          <form method="post" action="/export/download" className="mt-8 max-w-xs">
            <input type="hidden" name="org" value={org.id} />
            <button type="submit" className={buttonClass}>Download</button>
            <p className="mt-2 text-xs text-neutral-500">Up to 5 exports an hour. Large organisations may take a minute.</p>
          </form>
        </>
      )}
    </main>
  );
}
