"use client";

import { useState } from "react";
import { AuthField, authInput } from "@/components/v2-form";
import { Step, V2Stepper } from "@/components/v2-stepper";
import { CURRENCY, DEFAULT_TIMEZONE } from "@/lib/dashboard/org-form";

// Create organisation in three steps (issue #139): name, where you work, review.
// One form, posted to createOrganization; the timezone list comes from the server.
export function CreateOrgWizard({ action, timezones }: { action: (form: FormData) => Promise<void>; timezones: string[] }) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  return (
    <form action={action} className="db-create-form">
      <V2Stepper label="Create your organisation" submitLabel="Create organisation">
        <Step title="Name it">
          <AuthField label="Organisation name" hint="1 to 120 characters. Your team sees this name.">
            <input
              name="name"
              required
              maxLength={120}
              autoComplete="organization"
              className={authInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </AuthField>
        </Step>

        <Step title="Where you work">
          <AuthField label="Timezone" hint="Attendance days and wage periods follow this clock.">
            <select name="timezone" className={authInput} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </AuthField>
          <div className="au-field-row">
            <span className="lp-mono">Currency</span>
            <p className="db-fixed">
              {CURRENCY} · Indian rupee <span className="lp-mono lp-muted">Fixed for the MVP</span>
            </p>
          </div>
        </Step>

        <Step title="Check and create">
          <dl className="db-review">
            <div>
              <dt className="lp-mono lp-muted">Name</dt>
              <dd>{name.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="lp-mono lp-muted">Timezone</dt>
              <dd>{timezone.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt className="lp-mono lp-muted">Currency</dt>
              <dd>{CURRENCY}</dd>
            </div>
            <div>
              <dt className="lp-mono lp-muted">Your role</dt>
              <dd>Owner</dd>
            </div>
          </dl>
          <p className="db-next">Next you can add a site, invite your team and add workers from the dashboard.</p>
        </Step>
      </V2Stepper>
    </form>
  );
}
