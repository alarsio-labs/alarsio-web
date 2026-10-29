import type { ReactNode } from "react";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";
import { anton, mono } from "../fonts";
import "../landing.css";
import "../v2-form.css";
import "./app.css";

// The frame of every signed-in page (docs/DESIGN.md section 2e): the v2 header with
// the wordmark, the signed-in email and Sign out. Each page still checks the user and
// its role itself; this layout only draws.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <div className={`lp app ${anton.variable} ${mono.variable}`}>
      <header className="lp-head app-head">
        <Link href="/dashboard" className="lp-display lp-wordmark" aria-label="Alarsio, dashboard">
          Alar<span>sio</span>
        </Link>
        {user && (
          <div className="app-account">
            {user.email && <span className="lp-mono lp-muted app-email">{user.email}</span>}
            <form action={signOut}>
              <button type="submit" className="lp-btn lp-btn-line lp-mono app-signout">Sign out</button>
            </form>
          </div>
        )}
      </header>
      <div className="app-body">{children}</div>
    </div>
  );
}
