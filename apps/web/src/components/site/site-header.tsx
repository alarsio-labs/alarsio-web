"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CTA } from "@/lib/landing/content";
import { HEADER_ITEMS, MENU_LINKS, isNavGroup, type NavGroup } from "@/lib/site/nav";
import { Wordmark } from "./wordmark";

// A header entry that opens a short list of links ("Who we serve"). A plain disclosure: a button
// that shows and hides a list of ordinary links, so Tab walks the links in order, with no menu
// roles to get wrong. Escape, a click outside, focus moving away and choosing a link all close it.
function HeaderGroup({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("focusin", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("focusin", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div className="lp-drop" ref={root}>
      <button ref={button} type="button" className="lp-drop-btn" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}>
        {group.label}
        <i aria-hidden="true" />
      </button>
      <ul id={panel} className="lp-drop-panel" hidden={!open}>
        {group.links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The public header (docs/DESIGN.md v2.1): page links on wide screens, and a Menu button that
// opens a full-screen menu on every width below that. The menu is a native modal <dialog>, so
// the browser keeps focus inside it, Esc closes it and the page behind is inert.
export function SiteHeader({ whatsApp }: { whatsApp?: string | null }) {
  const menu = useRef<HTMLDialogElement>(null);
  const menuId = useId();
  // Mirrors the dialog, so the Menu button can say whether it is open (aria-expanded). The
  // dialog's own close event covers Esc as well as the Close button and the links.
  const [menuOpen, setMenuOpen] = useState(false);
  const open = () => {
    menu.current?.showModal();
    setMenuOpen(true);
  };
  const close = () => menu.current?.close();

  return (
    <header className="lp-head">
      <Wordmark />
      <nav aria-label="Main" className="lp-head-links">
        {HEADER_ITEMS.map((item) =>
          isNavGroup(item) ? (
            <HeaderGroup key={item.label} group={item} />
          ) : (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          )
        )}
      </nav>
      <div className="lp-head-right">
        <Link href={CTA.secondary.href} className="lp-pill lp-pill-line lp-head-signin">{CTA.secondary.label}</Link>
        <Link href={CTA.primary.href} className="lp-pill lp-pill-red">{CTA.primary.label}</Link>
        <button type="button" className="lp-menu-btn" onClick={open} aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuId}>
          <i aria-hidden="true" />
          <span>Menu</span>
        </button>
      </div>

      <dialog ref={menu} id={menuId} className="lp-menu" aria-label="Menu" onClose={() => setMenuOpen(false)}>
        <div className="lp-menu-in">
          <div className="lp-menu-top">
            <Wordmark />
            <button type="button" className="lp-menu-close" onClick={close} autoFocus>Close</button>
          </div>
          <p className="lp-menu-eyebrow">( Alarsio · site records with no signal )</p>
          <nav aria-label="Pages">
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
            <Link href={CTA.pilot.href} className="lp-pill lp-pill-ghost" onClick={close}>{CTA.pilot.label}</Link>
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
