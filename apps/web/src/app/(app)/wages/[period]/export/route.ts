import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { readPeriod, readSummaryRows } from "@/lib/wages/read";
import { exportFileName, summaryCsv } from "@/lib/wages/summary";
import { summaryXlsx } from "@/lib/wages/xlsx";

// The summary the screen shows, as CSV or Excel. Both are built from the same
// summaryTable() the page renders, so the totals match to the paisa (#61 AC 9). It
// reads wage_summary as the signed-in user: RLS (can_view_wages) decides who gets a
// file, and a project manager or supervisor gets a 404, never a figure.
// GET is safe here: it changes nothing and exports only what the screen shows.
export async function GET(request: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period: periodId } = await params;
  const org = request.nextUrl.searchParams.get("org");
  const format = request.nextUrl.searchParams.get("format");
  if (!UUID.test(periodId) || org === null || !UUID.test(org) || (format !== "csv" && format !== "xlsx")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    signIn.searchParams.set("next", `/wages/${periodId}?org=${org}`);
    return NextResponse.redirect(signIn, 303);
  }

  const period = await readPeriod(supabase, periodId, org);
  if (!period) return new NextResponse("Not found", { status: 404 });
  const summary = await readSummaryRows(supabase, periodId);
  if (!summary) return new NextResponse("The export could not be made. Try again.", { status: 500 });
  // A figure the page could not read must not be missing from a file someone pays from.
  if (summary.dropped > 0) {
    return new NextResponse("Some rows could not be read, so nothing was exported. Tell the team.", { status: 500 });
  }

  const name = exportFileName(period.start_date, period.end_date, format);
  const headers = {
    "content-disposition": `attachment; filename="${name}"`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
  if (format === "csv") {
    return new NextResponse(summaryCsv(summary.rows), {
      headers: { ...headers, "content-type": "text/csv; charset=utf-8" }
    });
  }
  const file = summaryXlsx(summary.rows);
  return new NextResponse(new Blob([file as BlobPart]), {
    headers: {
      ...headers,
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  });
}
