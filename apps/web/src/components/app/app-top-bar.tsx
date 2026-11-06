import Link from "next/link";
import type { OrgLink } from "@/lib/dashboard/links";
import { Icon } from "./nav-icon";
import { SidebarNav } from "./sidebar-nav";

// The console's top bar (docs/DESIGN.md section 4): the wordmark, the modules as pills,
// the organisation switcher and an account menu. The caller passes the sign-out
// server action, so these stay plain components. Both menus are native <details>,
// so they open without JavaScript.

type SignOut = (form: FormData) => void | Promise<void>;

const initial = (s: string) => s.trim().charAt(0).toUpperCase() || "A";

/** The wordmark: back to /dashboard, which sends a one-organisation user to their home. */
export function Brand() {
  return (
    <Link href="/dashboard" className="cx-brand" aria-label="Alarsio, dashboard">
      <span className="cx-brand-mark" aria-hidden="true" />
      <span className="cx-brand-name">Alarsio</span>
    </Link>
  );
}

/** The organisation and role; opens the dashboard hub to change organisation. */
export function OrgSwitch({ orgName, roleLabel }: { orgName: string; roleLabel?: string }) {
  return (
    <Link href="/dashboard" className="cx-org" title="Change organisation">
      <span className="cx-org-avatar" aria-hidden="true">{initial(orgName)}</span>
      <span className="cx-org-text">
        <span className="cx-org-name">{orgName}</span>
        {roleLabel && <span className="cx-org-role">{roleLabel}</span>}
      </span>
      <Icon name="chevrons" size={16} />
    </Link>
  );
}

export function SignOutButton({ signOut }: { signOut: SignOut }) {
  return (
    <form action={signOut} className="cx-signout">
      <button type="submit" className="cx-signout-btn">
        <Icon name="signout" size={16} />
        Sign out
      </button>
    </form>
  );
}

/** The round account button and its menu: who is signed in, and Sign out. */
export function AccountMenu({ email, signOut }: { email?: string; signOut: SignOut }) {
  return (
    <details className="cx-account">
      <summary className="cx-account-button" aria-label="Account">
        {email ? initial(email) : <Icon name="workers" size={18} />}
      </summary>
      <div className="cx-pop cx-account-panel">
        {email && (
          <p className="cx-account-email">
            <span className="cx-account-label">Signed in as</span>
            <span title={email}>{email}</span>
          </p>
        )}
        <SignOutButton signOut={signOut} />
      </div>
    </details>
  );
}

export function AppTopBar({
  orgName,
  roleLabel,
  email,
  links = [],
  current = null,
  signOut
}: {
  orgName?: string;
  roleLabel?: string;
  email?: string;
  links?: readonly OrgLink[];
  current?: string | null;
  signOut: SignOut;
}) {
  const withNav = links.length > 0;
  const here = links.find((l) => l.path === current);
  return (
    <header className={`cx-top${withNav ? " cx-top-nav" : ""}`}>
      <Brand />
      {withNav && (
        <nav className="cx-pill-track" aria-label="Modules">
          <SidebarNav links={links} current={current} variant="pills" />
        </nav>
      )}
      <div className="cx-top-end">
        {orgName && <OrgSwitch orgName={orgName} roleLabel={roleLabel} />}
        {withNav && (
          <details className="cx-menu">
            <summary className="cx-menu-button" aria-label="Menu">
              <Icon name="menu" size={18} />
              <span className="cx-menu-here">{here?.label ?? "Menu"}</span>
            </summary>
            <div className="cx-pop cx-menu-panel">
              {orgName && <OrgSwitch orgName={orgName} roleLabel={roleLabel} />}
              <SidebarNav links={links} current={current} />
            </div>
          </details>
        )}
        <AccountMenu email={email} signOut={signOut} />
      </div>
    </header>
  );
}

/** Where you are, above the page title: organisation / module. */
export function Crumbs({ orgName, pageLabel }: { orgName: string; pageLabel?: string }) {
  return (
    <nav className="cx-crumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <Icon name="folder" size={15} />
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
  );
}
