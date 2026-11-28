import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { READING_NOTES } from "@/lib/export/guide";
import { exportFileName } from "@/lib/export/run";
import { EXPORT_TABLES, type ExportTable } from "@/lib/export/tables";
import { ownedOrganization } from "@/lib/export/supabase";
import { buttonClass } from "@/components/form";
import { Card } from "@/components/app/card";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";

export const metadata = { title: "Export" };

// Tables sit next to each other by group in EXPORT_TABLES, so Map keeps that order.
const groups = [
  ...EXPORT_TABLES.reduce((m, t) => m.set(t.group, [...(m.get(t.group) ?? []), t]), new Map<string, ExportTable[]>())
];

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
  } = await getAuthUser();
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

          <Card title="How to read the files" id="ex-guide">
            <p className="ax-empty">
              You get one ZIP, named like <span className="ax-mono">{exportFileName(org.name, new Date())}</span>. Inside:
              a CSV for each kind of record, a <span className="ax-mono">manifest.csv</span> that counts the rows, and a{" "}
              <span className="ax-mono">README.txt</span> with these notes.
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5">
              {READING_NOTES.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Card>

          <Card title="What is in the file" id="ex-tables">
            <p className="ax-empty">
              It holds what you can see in Alarsio today. Photo files are not included; each photo&apos;s storage path is.
            </p>
            <div className="mt-4 grid gap-5">
              {groups.map(([group, tables]) => (
                <section key={group}>
                  <h3 className="font-semibold">{group}</h3>
                  <dl className="mt-1 grid gap-1">
                    {tables.map((t) => (
                      <div key={t.table}>
                        <dt className="ax-mono">{t.table}.csv</dt>
                        <dd className="ax-empty">{t.about}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
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
