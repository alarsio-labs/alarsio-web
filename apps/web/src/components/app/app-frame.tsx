"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { activeLink } from "@/lib/app/nav";
import { orgLinks } from "@/lib/dashboard/links";
import { ROLE_LABEL, type Membership } from "@/lib/dashboard/memberships";
import { AppTopBar } from "./app-top-bar";
import { ModuleTabs } from "./module-tabs";

// The top bar and module tabs for the page being shown (docs/DESIGN.md section 4).
// The organisation is the page's own ?org=; a layout cannot read the query string,
// so this one small piece runs on the client. With no ?org= (the dashboard hub) it
// shows the bar alone. Which links appear is a convenience; every page checks the
// role again and RLS decides what is read.
export function AppFrame({
  memberships,
  signOut
}: {
  memberships: readonly Membership[];
  signOut: (form: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname();
  const org = useSearchParams().get("org");
  const current = memberships.find((m) => m.orgId === org) ?? null;
  const links = current ? orgLinks(current.role, current.orgId) : [];
  return (
    <>
      <AppTopBar orgName={current?.orgName} roleLabel={current ? ROLE_LABEL[current.role] : undefined} signOut={signOut} />
      <ModuleTabs links={links} current={activeLink(links, pathname)?.path ?? null} />
    </>
  );
}
