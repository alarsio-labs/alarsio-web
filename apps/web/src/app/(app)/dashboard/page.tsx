import Link from "next/link";
import { redirect } from "next/navigation";
import { isAppRole, type AppRole } from "@alarsio/types";
import { supabaseServer } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { Field, Notice, buttonClass, inputClass } from "@/components/form";
import { signOut } from "../../(auth)/actions";
import { createOrganization } from "./actions";

type Membership = { orgId: string; orgName: string; role: AppRole };

function toMemberships(rows: unknown): Membership[] {
  if (!Array.isArray(rows)) return [];
  const out: Membership[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const org = row.organizations as Record<string, unknown> | null;
    if (typeof row.org_id === "string" && isAppRole(row.role) && org && typeof org.name === "string") {
      out.push({ orgId: row.org_id, orgName: org.name, role: row.role });
    }
  }
  return out;
}

const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  project_manager: "Project manager",
  supervisor: "Supervisor",
  accountant: "Accountant"
};

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data } = await supabase
    .from("memberships")
    .select("org_id, role, organizations(name)")
    .eq("user_id", user.id);
  const memberships = toMemberships(data);
  const error = messageFor((await searchParams).error);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Alarsio</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">Sign out</button>
        </form>
      </div>

      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}

      {memberships.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Your organisations</h2>
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200">
            {memberships.map((m) => (
              <li key={m.orgId} className="flex items-center justify-between px-4 py-3">
                <span>
                  {m.orgName} <span className="text-sm text-neutral-500">· {ROLE_LABEL[m.role]}</span>
                </span>
                <span className="flex items-center gap-4">
                  {m.role !== "accountant" && (
                    <Link href={`/reports?org=${m.orgId}`} className="text-sm underline">Daily reports</Link>
                  )}
                  {(m.role === "owner" || m.role === "project_manager") && (
                    <Link href={`/sites?org=${m.orgId}`} className="text-sm underline">Sites</Link>
                  )}
                  {(m.role === "owner" || m.role === "project_manager") && (
                    <Link href={`/materials?org=${m.orgId}`} className="text-sm underline">Materials</Link>
                  )}
                  {m.role === "owner" && (
                    <Link href={`/team?org=${m.orgId}`} className="text-sm underline">Team</Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mt-8 max-w-sm">
          <h2 className="text-lg font-medium">Create your organisation</h2>
          <p className="mt-1 text-sm text-neutral-600">
            You will be its owner. Joining someone else&apos;s? Open the invite link they sent you.
          </p>
          <form action={createOrganization} className="mt-4 space-y-4">
            <Field label="Organisation name">
              <input name="name" required maxLength={120} className={inputClass} />
            </Field>
            <button type="submit" className={buttonClass}>Create organisation</button>
          </form>
        </section>
      )}
    </main>
  );
}
