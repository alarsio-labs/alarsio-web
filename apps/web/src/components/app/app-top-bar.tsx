import Link from "next/link";
import type { OrgLink } from "@/lib/dashboard/links";
import { Icon } from "./nav-icon";
import { SidebarNav } from "./sidebar-nav";

// The console's pieces around the page (docs/DESIGN.md section 4). The caller passes
// the sign-out server action, so these stay plain components.

type SignOut = (form: FormData) => void | Promise<void>;

/** The wordmark: back to /dashboard, which sends a one-organisation user to their home. */
export function Brand() {
  return (
    <Link href="/dashboard" className="cx-brand" aria-label="Alarsio, dashboard">
      <span className="cx-brand-mark" aria-hidden="true" />
      Alarsio
    </Link>
  );
}

/** The organisation and role; opens the dashboard hub to change organisation. */
export function OrgSwitch({ orgName, roleLabel }: { orgName: string; roleLabel?: string }) {
  return (
    <Link href="/dashboard" className="cx-org" title="Change organisation">
      <span className="cx-org-avatar" aria-hidden="true">
        {orgName.trim().charAt(0).toUpperCase() || "A"}
      </span>
      <span className="cx-org-text">
        <span className="cx-org-name">{orgName}</span>
        {roleLabel && <span className="cx-org-role">{roleLabel}</span>}
      </span>
      <Icon name="chevrons" size={16} />
    </Link>
  );
}

export function SignOutButton({ signOut, compact = false }: { signOut: SignOut; compact?: boolean }) {
  return (
    <form action={signOut} className="cx-signout">
      <button type="submit" className={compact ? "ax-btn ax-btn-secondary ax-btn-sm" : "cx-signout-btn"}>
        {!compact && <Icon name="signout" size={16} />}
        Sign out
      </button>
    </form>
  );
}

/**
 * The bar above every page. On a wide screen with an organisation it carries only the
 * breadcrumb (the sidebar has the rest). On a phone, or with no organisation, it
 * carries the wordmark and Sign out too, and on a phone the modules fold into a
 * native <details> menu that works without JavaScript.
 */
export function AppTopBar({
  orgName,
  roleLabel,
  pageLabel,
  email,
  links = [],
  current = null,
  signOut
}: {
  orgName?: string;
  roleLabel?: string;
  pageLabel?: string;
  email?: string;
  links?: readonly OrgLink[];
  current?: string | null;
  signOut: SignOut;
}) {
  const withNav = links.length > 0;
  return (
    <header className={`cx-top${withNav ? " cx-top-nav" : ""}`}>
      <div className="cx-top-brand">
        <Brand />
      </div>
      {orgName && (
        <nav className="cx-crumbs" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link href="/dashboard" className="cx-crumb">{orgName}</Link>
            </li>
            {pageLabel && (
              <li>
                <span className="cx-crumb-sep" aria-hidden="true">/</span>
                <span className="cx-crumb cx-crumb-here" aria-current="page">{pageLabel}</span>
              </li>
            )}
          </ol>
        </nav>
      )}
      <div className="cx-top-end">
        {email && <span className="cx-email">{email}</span>}
        <SignOutButton signOut={signOut} compact />
      </div>
      {withNav && (
        <details className="cx-menu">
          <summary className="cx-menu-button" aria-label="Menu">
            <Icon name="menu" size={20} />
          </summary>
          <div className="cx-menu-panel">
            {orgName && <OrgSwitch orgName={orgName} roleLabel={roleLabel} />}
            <SidebarNav links={links} current={current} />
            <div className="cx-menu-foot">
              {email && <p className="cx-email">{email}</p>}
              <SignOutButton signOut={signOut} />
            </div>
          </div>
        </details>
      )}
    </header>
  );
}
