"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { activeLink } from "@/lib/app/nav";
import { orgLinks } from "@/lib/dashboard/links";
import { ROLE_LABEL, type Membership } from "@/lib/dashboard/memberships";
import { AppTopBar, Brand, OrgSwitch, SignOutButton } from "./app-top-bar";
import { SidebarNav } from "./sidebar-nav";

// The console frame for the page being shown (docs/DESIGN.md section 4): a sidebar
// with the organisation and its modules, and a top bar with the breadcrumb. The
// organisation is the page's own ?org=; a layout cannot read the query string, so
// this one small piece runs on the client. With no ?org= (the dashboard hub) there is
// no sidebar, only the bar. Which links appear is a convenience; every page checks
// the role again and RLS decides what is read.
export function AppFrame({
  memberships,
  email,
  signOut
}: {
  memberships: readonly Membership[];
  email?: string;
  signOut: (form: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname();
  const org = useSearchParams().get("org");
  const current = memberships.find((m) => m.orgId === org) ?? null;
  const links = current ? orgLinks(current.role, current.orgId) : [];
  const here = activeLink(links, pathname);
  const roleLabel = current ? ROLE_LABEL[current.role] : undefined;
  return (
    <>
      {current && links.length > 0 && (
        <aside className="cx-side" aria-label="Organisation">
          <div className="cx-side-brand">
            <Brand />
          </div>
          <OrgSwitch orgName={current.orgName} roleLabel={roleLabel} />
          <nav className="cx-side-nav" aria-label="Modules">
            <SidebarNav links={links} current={here?.path ?? null} />
          </nav>
          <div className="cx-side-foot">
            {email && <p className="cx-email" title={email}>{email}</p>}
            <SignOutButton signOut={signOut} />
          </div>
        </aside>
      )}
      <AppTopBar
        orgName={current?.orgName}
        roleLabel={roleLabel}
        pageLabel={here?.label}
        email={email}
        links={links}
        current={here?.path ?? null}
        signOut={signOut}
      />
    </>
  );
}
