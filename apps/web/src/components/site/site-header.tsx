"use client";

import { useRef } from "react";
import Link from "next/link";
import { CTA } from "@/lib/landing/content";
import { HEADER_LINKS, MENU_LINKS } from "@/lib/site/nav";
import { Wordmark } from "./wordmark";

// The public header (docs/DESIGN.md v2.1): page links on wide screens, and a Menu button that
// opens a full-screen menu on every width below that. The menu is a native modal <dialog>, so
// the browser keeps focus inside it, Esc closes it and the page behind is inert.
export function SiteHeader({ whatsApp }: { whatsApp?: string | null }) {
  const menu = useRef<HTMLDialogElement>(null);
  const open = () => menu.current?.showModal();
  const close = () => menu.current?.close();

  return (
    <header className="lp-head">
      <Wordmark />
      <nav aria-label="Main" className="lp-head-links">
        {HEADER_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
      </nav>
      <div className="lp-head-right">
        <Link href={CTA.secondary.href} className="lp-pill lp-pill-line lp-head-signin">{CTA.secondary.label}</Link>
        <Link href={CTA.primary.href} className="lp-pill lp-pill-red">{CTA.primary.label}</Link>
        <button type="button" className="lp-menu-btn" onClick={open} aria-haspopup="dialog">
          <i aria-hidden="true" />
          <span>Menu</span>
        </button>
      </div>

      <dialog ref={menu} className="lp-menu" aria-label="Menu">
        <div className="lp-menu-in">
          <div className="lp-menu-top">
            <Wordmark />
            <button type="button" className="lp-menu-close" onClick={close} autoFocus>Close</button>
          </div>
          <p className="lp-menu-eyebrow">( Alarsio · site records with no signal )</p>
          <nav aria-label="Menu">
            <ul className="lp-menu-links">
              {MENU_LINKS.map((l, i) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={close}>
                    <small aria-hidden="true">{String(i + 1).padStart(2, "0")}</small>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="lp-menu-foot">
            <Link href={CTA.primary.href} className="lp-pill lp-pill-red" onClick={close}>{CTA.primary.label}</Link>
            <Link href={CTA.secondary.href} className="lp-pill lp-pill-ghost" onClick={close}>{CTA.secondary.label}</Link>
            {whatsApp && (
              <a href={whatsApp} className="lp-pill lp-pill-ghost" target="_blank" rel="noopener noreferrer">WhatsApp us</a>
            )}
          </div>
        </div>
      </dialog>
    </header>
  );
}
