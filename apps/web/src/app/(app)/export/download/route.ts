import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { exportFileName, runExport } from "@/lib/export/run";
import { ownedOrganization, supabasePageReader, UUID } from "@/lib/export/supabase";

// The ZIP is built in memory (ADR-026); give a large organisation time to finish.
export const maxDuration = 60;

// A GET (a bookmark, a sign-in that came back here) starts nothing.
export function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/dashboard";
  url.search = "";
  return NextResponse.redirect(url, 303);
}

// POST only, so a link or an image cannot start an export (#76). Every read
// runs as the signed-in owner; nothing here widens what RLS returns.
export async function POST(request: NextRequest) {
  const back = (org: string | null, error?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = org ? "/export" : "/dashboard";
    url.search = "";
    if (org) url.searchParams.set("org", org);
    if (error) url.searchParams.set("error", error);
    return NextResponse.redirect(url, 303);
  };

  // A form on another site cannot use up the owner's export limit.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== request.nextUrl.origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const raw = form.get("org");
  const orgId = typeof raw === "string" && UUID.test(raw) ? raw : null;
  if (!orgId) return back(null);

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    signIn.searchParams.set("next", `/export?org=${orgId}`);
    return NextResponse.redirect(signIn, 303);
  }

  const org = await ownedOrganization(supabase, orgId);
  if (!org) return back(orgId);

  // Counted before any read, in its own request, so a failed export still
  // counts: retrying in a loop cannot load the database (ADR-026).
  const { error: limited } = await supabase.rpc("enforce_rate_limit", {
    p_key: "export_org_data",
    p_limit: 5,
    p_window: "1 hour"
  });
  if (limited) return back(orgId, limited.code === "PT429" ? "export_rate_limited" : "export_failed");

  const at = new Date();
  let zip: Uint8Array;
  try {
    zip = await runExport({ orgId, userId: user.id, at, read: supabasePageReader(supabase) });
  } catch (e) {
    // The message names a table and a PostgREST code, never a row.
    console.error("data export failed:", e instanceof Error ? e.message : "unknown error");
    return back(orgId, "export_failed");
  }

  return new NextResponse(zip as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exportFileName(org.name, at)}"`,
      "Cache-Control": "no-store"
    }
  });
}
