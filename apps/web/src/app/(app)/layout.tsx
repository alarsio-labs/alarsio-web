import { Suspense, type ReactNode } from "react";
import { AppFrame } from "@/components/app/app-frame";
import { AppTopBar } from "@/components/app/app-top-bar";
import { toMemberships } from "@/lib/dashboard/memberships";
import { getAuthUser, getMembershipRows, supabaseServer } from "@/lib/supabase/server";
import { shownName } from "@/lib/profile-name";
import { updateMyName } from "./account-actions";
import { signOut } from "../(auth)/actions";
import { anton, mono } from "../fonts";
import "../landing.css";
import "../v2-form.css";
import "./console.css";

// The frame of every signed-in page (docs/DESIGN.md section 4, the app console): a
// sidebar with the organisation, role and modules, and a top bar. The memberships are read
// once per request (getMembershipRows, shared with the dashboard), as the signed-in user; each page still checks the user and its role
// itself, so this layout only draws.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const {
    data: { user }
  } = await getAuthUser();
  // The memberships and the person's own name, read side by side (the name: audit issue 6).
  const supabase = await supabaseServer();
  const [rows, profile] = await Promise.all([
    getMembershipRows(),
    user ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : Promise.resolve(null)
  ]);
  const memberships = toMemberships(rows);
  const fullName: unknown = profile?.data?.full_name;
  const name = shownName(typeof fullName === "string" ? fullName : null);

  return (
    <div className={`lp app ${anton.variable} ${mono.variable}`}>
      <Suspense fallback={<AppTopBar email={user?.email} name={name} signOut={signOut} />}>
        <AppFrame memberships={memberships} email={user?.email} name={name} updateName={updateMyName} signOut={signOut} />
      </Suspense>
      {/* Each page draws its own <main>; this wrapper is the skip link's target. */}
      <div id="main" tabIndex={-1} className="app-body">{children}</div>
    </div>
  );
}
