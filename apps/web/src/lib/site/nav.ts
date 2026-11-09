// Where the public header, the full-screen menu and the site footer point (docs/DESIGN.md
// v2.1, "Public frame"). One list, so a link added here shows everywhere it belongs.

import { ROLES, roleId } from "@/lib/landing/content";

export type NavLink = { href: string; label: string };
/** A header entry that opens a short list of links instead of going to one page. */
export type NavGroup = { label: string; links: NavLink[] };

export function isNavGroup(item: NavLink | NavGroup): item is NavGroup {
  return "links" in item;
}

/**
 * "Who we serve": the four roles, each linking to its card in the home page's "Four roles" section.
 * Built from the same cards, so a role added or renamed there shows up here with its own anchor.
 */
export const WHO_WE_SERVE: NavLink[] = ROLES.cards.map((c) => ({ href: `/#${roleId(c.role)}`, label: `${c.role}s` }));

/** The header's entries on wide screens, in order. */
export const HEADER_ITEMS: (NavLink | NavGroup)[] = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { label: "Who we serve", links: WHO_WE_SERVE },
  { href: "/download", label: "Download app" },
  { href: "/about", label: "About" }
];

/** The full-screen menu: every public destination, numbered in the order shown. */
export const MENU_LINKS: NavLink[] = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#roles", label: "Who does what" },
  { href: "/download", label: "Download app" },
  { href: "/#faq", label: "Questions" },
  { href: "/about", label: "About" },
  { href: "/demo", label: "Book a demo" },
  { href: "/contact", label: "Contact" }
];

export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how", label: "How it works" },
      { href: "/#roles", label: "Who does what" },
      { href: "/#faq", label: "Questions" }
    ]
  },
  {
    title: "Get started",
    links: [
      { href: "/demo", label: "Book a demo" },
      { href: "/sign-up", label: "Start free pilot" },
      { href: "/download", label: "Download app" },
      { href: "/sign-in", label: "Sign in" }
    ]
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" }
    ]
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" }
    ]
  }
];
