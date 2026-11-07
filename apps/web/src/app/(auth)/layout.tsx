import type { ReactNode } from "react";
import Link from "next/link";
import { archivo, bricolage, instrument } from "../fonts";
import "./auth.css";

// The sign-in pages (docs/DESIGN.md section 2b, v3): a warm ground with the wordmark, and each
// page's own scene (components/auth/scene.tsx): a picture beside a glass card on wide screens,
// the card alone under its own small header on a phone.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`sx ${bricolage.variable} ${instrument.variable} ${archivo.variable}`}>
      <Link href="/" className="sx-logo" aria-label="Alarsio, home">
        Alar<span>sio</span>
      </Link>
      <main id="main" tabIndex={-1} className="sx-main">
        {children}
      </main>
    </div>
  );
}
