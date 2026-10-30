import { Suspense, type ReactNode } from "react";
import { AppFrame } from "@/components/app/app-frame";
import { AppTopBar } from "@/components/app/app-top-bar";
import { toMemberships } from "@/lib/dashboard/memberships";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";
import { anton, mono } from "../fonts";
import "../landing.css";
import "../v2-form.css";
import "../v2-app.css";
import "./app.css";

// The frame of every signed-in page (docs/DESIGN.md section 4): the top bar with the
// organisation and role, and the module tabs for that role. The memberships are read
// once here, as the signed-in user; each page still checks the user and its role
// itself, so this layout only draws.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data } = user
    ? await supabase.from("memberships").select("org_id, role, organizations(name)").eq("user_id", user.id)
    : { data: null };
  const memberships = toMemberships(data);

  return (
    <div className={`lp app ${anton.variable} ${mono.variable}`}>
      <Suspense fallback={<AppTopBar signOut={signOut} />}>
        <AppFrame memberships={memberships} signOut={signOut} />
      </Suspense>
      <div className="app-body">{children}</div>
    </div>
  );
}
