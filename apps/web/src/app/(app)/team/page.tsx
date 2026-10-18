import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { revokeInvite } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type InviteRow = { id: string; email: string; role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };

function isInviteRow(r: unknown): r is InviteRow {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.email === "string" && typeof o.role === "string" && typeof o.expires_at === "string";
}

function statusOf(i: InviteRow, now: number): string {
  if (i.accepted_at) return "Accepted";
  if (i.revoked_at) return "Revoked";
  if (Date.parse(i.expires_at) <= now) return "Expired";
  return "Open";
}

export default async function TeamPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const org = (await searchParams).org;
  if (typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/team?org=${org}`)}`);

  // RLS returns this org only if the caller is a member, and invites only if
  // they are its owner. The page checks nothing the database does not.
  const [{ data: orgRow }, { data: isOwner }, { data: invites }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", org).maybeSingle(),
    supabase.rpc("is_org_owner", { p_org_id: org }),
    supabase
      .from("invites")
      .select("id, email, role, expires_at, accepted_at, revoked_at")
      .eq("org_id", org)
      .order("created_at", { ascending: false })
      .limit(50)
  ]);
  if (!orgRow || isOwner !== true) redirect("/dashboard");

  const rows = Array.isArray(invites) ? invites.filter(isInviteRow) : [];
  const now = Date.now();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/dashboard" className="text-sm underline">← Dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">{orgRow.name} · Team</h1>

      <section className="mt-8 max-w-sm">
        <h2 className="text-lg font-medium">Invite someone</h2>
        <div className="mt-4"><InviteForm orgId={org} /></div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Invites</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No invites yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200">
            {rows.map((i) => {
              const status = statusOf(i, now);
              return (
                <li key={i.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="truncate">{i.email} <span className="text-neutral-500">· {i.role.replace("_", " ")}</span></span>
                  <span className="flex items-center gap-3">
                    <span className="text-neutral-600">{status}</span>
                    {status === "Open" && (
                      <form action={revokeInvite}>
                        <input type="hidden" name="invite_id" value={i.id} />
                        <button type="submit" className="underline">Revoke</button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
