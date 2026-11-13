import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser, getMembershipRows } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { orgLinks } from "@/lib/dashboard/links";
import { ROLE_LABEL, homeFor, toMemberships } from "@/lib/dashboard/memberships";
import { AuthNotice } from "@/components/v2-form";
import { timezoneOptions } from "@/lib/dashboard/org-form";
import { Icon, iconForPath } from "@/components/app/nav-icon";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { rememberedInvitePath } from "@/lib/auth/pending-invite";
import { createOrganization } from "./actions";
import { CreateOrgWizard } from "./create-org-wizard";
import "./dashboard.css";

// The dashboard in the app console (docs/DESIGN.md section 4): the create stepper
// with no organisation, and the hub with several; one organisation goes to its home.
// Each organisation is a card with the pages the member's role can open; the links
// come from orgLinks().
export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const {
    data: { user }
  } = await getAuthUser();
  if (!user) redirect("/sign-in");

  // The same rows the layout read for this request (cached), not a second query.
  const memberships = toMemberships(await getMembershipRows());
  const error = messageFor((await searchParams).error);
  // With one organisation the dashboard is only a hop: go straight to the role's home.
  // An error from creating an organisation still shows here, since that user has none.
  const home = error ? null : homeFor(memberships);
  if (home) redirect(home);
  const hasOrgs = memberships.length > 0;
  // Someone who opened an invite and then signed in without it (13 Nov) belongs in that
  // organisation, not in a new one: send them back to "Join the team".
  if (!hasOrgs && !error) {
    const invite = await rememberedInvitePath();
    if (invite) redirect(invite);
  }

  return (
    <main className="db-main">
      <PageHead
        eyebrow={hasOrgs ? "Choose an organisation to open its workspace" : "You will be its owner. Joining someone else's? Open the invite link they sent you."}
        title={hasOrgs ? "Your organisations" : "Create your organisation"}
      />

      {error && <AuthNotice kind="error">{error}</AuthNotice>}

      {hasOrgs ? (
        <ul className="db-orgs">
          {memberships.map((m) => (
            <li key={m.orgId} className="db-org">
              <div className="db-org-head">
                <span className="db-org-avatar" aria-hidden="true">
                  {m.orgName.trim().charAt(0).toUpperCase() || "A"}
                </span>
                <h2 className="db-org-name">{m.orgName}</h2>
                <StatusTag tone="muted">{ROLE_LABEL[m.role]}</StatusTag>
              </div>
              <ul className="db-links">
                {orgLinks(m.role, m.orgId).map((l) => {
                  const icon = iconForPath(l.path);
                  return (
                    <li key={l.path}>
                      <Link href={l.path} className="db-link">
                        <span className="db-link-icon">{icon && <Icon name={icon} />}</span>
                        <span className="db-link-text">
                          <span className="db-link-label">{l.label}</span>
                          <span className="db-link-note">{l.note}</span>
                        </span>
                        <span className="db-link-arrow"><Icon name="arrow" size={16} /></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <div className="db-create">
          <CreateOrgWizard action={createOrganization} timezones={timezoneOptions(Intl.supportedValuesOf("timeZone"))} />
        </div>
      )}
    </main>
  );
}
