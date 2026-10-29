import Link from "next/link";
import { NAV } from "@/lib/landing/content";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function Wordmark() {
  return (
    <Link href="/" className={`flex items-center gap-2 rounded-md text-lg font-extrabold tracking-[-0.02em] text-ink ${focus}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-7">
        <rect width="24" height="24" rx="7" className="fill-accent" />
        <path d="M6 17 12 6l6 11h-3.2L12 11.6 9.2 17Z" className="fill-ink" />
      </svg>
      Alarsio
    </Link>
  );
}

// Sticky header (DESIGN.md section 3). Below 768 px the links fold into a
// <details> menu, so it works with no JavaScript.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-6 lg:px-12">
        <Wordmark />
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex gap-8 text-[15px] font-medium text-ink-muted">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className={`rounded-md hover:text-ink ${focus}`}>{n.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className={`hidden h-10 items-center rounded-[10px] bg-night px-4 text-[15px] font-semibold text-white sm:flex ${focus}`}>
            Sign in
          </Link>
          <Link href="/sign-up" className={`flex h-10 items-center rounded-[10px] bg-accent px-4 text-[15px] font-semibold text-ink transition-colors duration-150 hover:bg-accent-hover ${focus}`}>
            Join the pilot
          </Link>
          <details className="relative md:hidden">
            <summary className={`flex size-12 cursor-pointer list-none items-center justify-center rounded-[10px] ${focus} [&::-webkit-details-marker]:hidden`}>
              <span className="sr-only">Menu</span>
              <svg aria-hidden viewBox="0 0 24 24" className="size-6 stroke-ink" fill="none" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </summary>
            <ul className="absolute right-0 mt-2 w-56 rounded-2xl border border-line bg-surface p-2 shadow-float">
              {NAV.map((n) => (
                <li key={n.href}>
                  <a href={n.href} className={`flex min-h-12 items-center rounded-xl px-4 font-medium text-ink hover:bg-canvas ${focus}`}>{n.label}</a>
                </li>
              ))}
              <li className="sm:hidden">
                <Link href="/sign-in" className={`flex min-h-12 items-center rounded-xl px-4 font-medium text-ink hover:bg-canvas ${focus}`}>Sign in</Link>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </header>
  );
}
