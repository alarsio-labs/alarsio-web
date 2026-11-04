import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Button } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import type { StatusTone } from "@/lib/app/status";
import { InviteForm } from "./invite-form";
import { revokeInvite } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type InviteRow = { id: string; email: string; role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };

function isInviteRow(r: unknown): r is InviteRow {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.email === "string" && typeof o.role === "string" && typeof o.expires_at === "string";
}

// An open or accepted invite is ink; a revoked or expired one is muted. None asks
// the owner to act, so none is red-deep.
const INVITE_TONE: Record<string, StatusTone> = { Open: "ink", Accepted: "ink", Revoked: "muted", Expired: "muted" };

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
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <PageHead eyebrow={orgRow.name} title="Team" />

      <div className="ov-columns">
        <Card title="Invites" id="tm-invites">
          <DataTable<InviteRow>
            caption="Invites"
            rows={rows}
            rowKey={(i) => i.id}
            minWidth={520}
            empty="No invites yet."
            columns={[
              { key: "email", label: "Email", render: (i) => <span className="break-all">{i.email}</span> },
              { key: "role", label: "Role", render: (i) => i.role.replace("_", " ") },
              {
                key: "status",
                label: "Status",
                render: (i) => {
                  const status = statusOf(i, now);
                  return (
                    <span className="ov-tags items-center">
                      <StatusTag tone={INVITE_TONE[status] ?? "ink"}>{status}</StatusTag>
                      {status === "Open" && (
                        <form action={revokeInvite}>
                          <input type="hidden" name="invite_id" value={i.id} />
                          <Button type="submit" variant="secondary">Revoke</Button>
                        </form>
                      )}
                    </span>
                  );
                }
              }
            ]}
          />
        </Card>

        <Card title="Invite someone" id="tm-invite">
          <InviteForm orgId={org} />
        </Card>
      </div>
    </main>
  );
}
