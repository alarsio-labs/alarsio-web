"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { activeLink } from "@/lib/app/nav";
import { orgLinks } from "@/lib/dashboard/links";
import { ROLE_LABEL, type Membership } from "@/lib/dashboard/memberships";
import { AppTopBar, Crumbs } from "./app-top-bar";

// The console frame for the page being shown (docs/DESIGN.md section 4): the top bar
// with the modules as pills, and the breadcrumb above the page. The organisation is
// the page's own ?org=; a layout cannot read the query string, so this one small piece
// runs on the client. With no ?org= (the dashboard hub) there are no modules and no
// breadcrumb. Which links appear is a convenience; every page checks the role again
// and RLS decides what is read.
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
  return (
    <>
      <AppTopBar
        orgName={current?.orgName}
        roleLabel={current ? ROLE_LABEL[current.role] : undefined}
        email={email}
        links={links}
        current={here?.path ?? null}
        signOut={signOut}
      />
      {current && <Crumbs orgName={current.orgName} pageLabel={here?.label} />}
    </>
  );
}
