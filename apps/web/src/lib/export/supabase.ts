import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PageReader } from "./run";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The organisation, if the signed-in user owns it. RLS returns the row only to
// a member, and is_org_owner answers for the caller alone, so a non-member and
// a non-owner both get null and learn nothing about the organisation.
export async function ownedOrganization(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ id: string; name: string } | null> {
  if (!UUID.test(orgId)) return null;
  const [{ data: org }, { data: isOwner }] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("id", orgId).maybeSingle(),
    supabase.rpc("is_org_owner", { p_org_id: orgId })
  ]);
  if (!org || isOwner !== true || typeof org.name !== "string") return null;
  return { id: orgId, name: org.name };
}

// Reads one page as the signed-in user, so RLS decides every row (ADR-026).
export function supabasePageReader(supabase: SupabaseClient): PageReader {
  return async (q) => {
    let query = supabase.from(q.table).select(q.columns.join(","));
    if (q.orgColumn !== null) query = query.eq(q.orgColumn, q.orgId);
    if (q.afterId !== null) query = query.gt("id", q.afterId);
    const { data, error } = await query.order("id", { ascending: true }).limit(q.limit);
    if (error) throw new Error(`export of ${q.table} failed: ${error.code ?? ""} ${error.message}`);
    return (data ?? []) as unknown as Record<string, unknown>[];
  };
}
