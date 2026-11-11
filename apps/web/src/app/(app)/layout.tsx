import { Suspense, type ReactNode } from "react";
import { AppFrame } from "@/components/app/app-frame";
import { AppTopBar } from "@/components/app/app-top-bar";
import { toMemberships } from "@/lib/dashboard/memberships";
import { getAuthUser, getMembershipRows } from "@/lib/supabase/server";
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
  const memberships = toMemberships(await getMembershipRows());

  return (
    <div className={`lp app ${anton.variable} ${mono.variable}`}>
      <Suspense fallback={<AppTopBar email={user?.email} signOut={signOut} />}>
        <AppFrame memberships={memberships} email={user?.email} signOut={signOut} />
      </Suspense>
      {/* Each page draws its own <main>; this wrapper is the skip link's target. */}
      <div id="main" tabIndex={-1} className="app-body">{children}</div>
    </div>
  );
}
