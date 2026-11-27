import Link from "next/link";
import type { ReactNode } from "react";
import type { OrgLink } from "@/lib/dashboard/links";
import type { NameState } from "@/app/(app)/account-actions";
import { NameForm } from "./name-form";
import { Icon } from "./nav-icon";
import { PageStrip, SectionTabs } from "./sidebar-nav";

// The console's top bar (docs/DESIGN.md section 5): the wordmark on a slate bar, the
// section tabs, the organisation switcher and an account menu, then the pages of the
// current section. On a phone the tabs move to a bottom bar. The caller passes the
// sign-out server action, so these stay plain components. The account menu is a native
// <details>, so it opens without JavaScript.

type SignOut = (form: FormData) => void | Promise<void>;
type UpdateName = (prev: NameState, form: FormData) => Promise<NameState>;

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

/** The round account button and its menu: who is signed in, their name, and Sign out. */
export function AccountMenu({
  email,
  name,
  updateName,
  signOut,
  org
}: {
  email?: string;
  name?: string | null;
  updateName?: UpdateName;
  signOut: SignOut;
  /** The organisation switcher; shown here on a phone, where the bar has no room for it. */
  org?: ReactNode;
}) {
  const label = name || email;
  return (
    <details className="cx-account">
      <summary className="cx-account-button" aria-label="Account">
        {label ? initial(label) : <Icon name="workers" size={18} />}
      </summary>
      <div className="cx-pop cx-account-panel">
        {org && <div className="cx-org-narrow">{org}</div>}
        {email && (
          <p className="cx-account-email">
            <span className="cx-account-label">Signed in as</span>
            {name && <span className="cx-account-name">{name}</span>}
            <span title={email}>{email}</span>
          </p>
        )}
        {updateName && <NameForm name={name ?? null} action={updateName} />}
        <SignOutButton signOut={signOut} />
      </div>
    </details>
  );
}

export function AppTopBar({
  orgName,
  roleLabel,
  email,
  name,
  updateName,
  links = [],
  current = null,
  signOut
}: {
  orgName?: string;
  roleLabel?: string;
  email?: string;
  name?: string | null;
  updateName?: UpdateName;
  links?: readonly OrgLink[];
  current?: string | null;
  signOut: SignOut;
}) {
  const org = orgName ? <OrgSwitch orgName={orgName} roleLabel={roleLabel} /> : null;
  return (
    <>
      <header className="cx-top">
        <div className="cx-bar">
          <Brand />
          <SectionTabs links={links} current={current} className="cx-tabs-top" />
          <div className="cx-top-end">
            <div className="cx-org-wide">{org}</div>
            <AccountMenu email={email} name={name} updateName={updateName} signOut={signOut} org={org} />
          </div>
        </div>
        <PageStrip links={links} current={current} />
      </header>
      <SectionTabs links={links} current={current} className="cx-tabs-bottom" />
    </>
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
