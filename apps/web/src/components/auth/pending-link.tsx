"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

function Status({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="sx-link-in" data-pending={pending || undefined}>
      {children}
      <span className="sx-spin sx-spin-sm" aria-hidden="true" />
    </span>
  );
}

/**
 * A link between the sign-in pages that shows a small spinner while the next page loads,
 * so a slow network never looks like a dead tap.
 */
export function PendingLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={className ?? "sx-link"}>
      <Status>{children}</Status>
    </Link>
  );
}
