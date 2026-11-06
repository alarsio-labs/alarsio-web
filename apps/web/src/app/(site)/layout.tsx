import type { ReactNode } from "react";
import { PublicHeader, SiteFooter } from "@/components/site/public-frame";
import { anton, mono } from "../fonts";
import "../landing.css";
import "./site.css";

// Shared frame for the public information pages. Static: no session lookup, no motion.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`lp lp-site ${anton.variable} ${mono.variable}`}>
      <PublicHeader />

      <main id="main" tabIndex={-1}>{children}</main>

      <SiteFooter />
    </div>
  );
}
