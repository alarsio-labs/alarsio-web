import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { orgLinks } from "@/lib/dashboard/links";
import { ROLE_LABEL, homeFor, toMemberships } from "@/lib/dashboard/memberships";
import { AuthNotice } from "@/components/v2-form";
import { timezoneOptions } from "@/lib/dashboard/org-form";
import { FieldCanvas } from "@/components/landing/field-canvas";
import { createOrganization } from "./actions";
import { CreateOrgWizard } from "./create-org-wizard";
import "./dashboard.css";

// The dashboard in the v2 look (docs/DESIGN.md): the create stepper with no
// organisation, and the hub with several; one organisation goes to its home. Each organisation is a paper card with the pages the member's role can
// open; the links come from orgLinks().
export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data } = await supabase
    .from("memberships")
    .select("org_id, role, organizations(name)")
    .eq("user_id", user.id);
  const memberships = toMemberships(data);
  const error = messageFor((await searchParams).error);
  // With one organisation the dashboard is only a hop: go straight to the role's home.
  // An error from creating an organisation still shows here, since that user has none.
  const home = error ? null : homeFor(memberships);
  if (home) redirect(home);
  const hasOrgs = memberships.length > 0;

  return (
    <div className="db">
      <section className="db-band on-loam" aria-labelledby="db-title">
        <FieldCanvas className="db-field" />
        <div className="db-band-inner">
          <p className="lp-mono db-eyebrow">Dashboard</p>
          <h1 id="db-title" className="lp-display db-title">{hasOrgs ? "Your organisations" : "Create your organisation"}</h1>
        </div>
      </section>

      <main className="db-main">
        {error && <AuthNotice kind="error">{error}</AuthNotice>}

        {hasOrgs ? (
          <ul className="db-orgs">
            {memberships.map((m) => (
              <li key={m.orgId} className="db-org">
                <div className="db-org-head">
                  <h2 className="lp-display db-org-name">{m.orgName}</h2>
                  <p className="lp-mono lp-role">{ROLE_LABEL[m.role]}</p>
                </div>
                <ul className="db-links">
                  {orgLinks(m.role, m.orgId).map((l) => (
                    <li key={l.path}>
                      <Link href={l.path} className="db-link">
                        <span className="lp-mono db-link-label">{l.label}</span>
                        <span className="db-link-note">{l.note}</span>
                        <span aria-hidden="true" className="db-link-arrow">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <div className="db-create">
            <p className="au-body">
              You will be its owner. Joining someone else&apos;s? Open the invite link they sent you.
            </p>
            <CreateOrgWizard action={createOrganization} timezones={timezoneOptions(Intl.supportedValuesOf("timeZone"))} />
          </div>
        )}
      </main>
    </div>
  );
}
