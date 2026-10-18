"use client";

import { useActionState } from "react";
import { APP_ROLES } from "@alarsio/types";
import { Field, Notice, buttonClass, inputClass } from "@/components/form";
import { createInvite, type InviteState } from "./actions";

const ROLE_LABEL: Record<(typeof APP_ROLES)[number], string> = {
  owner: "Owner",
  project_manager: "Project manager",
  supervisor: "Supervisor",
  accountant: "Accountant"
};

export function InviteForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvite, { status: "idle" });

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="org_id" value={orgId} />
        <Field label="Email">
          <input name="email" type="email" required autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Role">
          <select name="role" defaultValue="supervisor" className={inputClass}>
            {APP_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </Field>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Sending…" : "Send invite"}
        </button>
      </form>

      {state.status === "error" && <Notice kind="error">{state.message}</Notice>}
      {state.status === "sent" && (
        <div className="space-y-2">
          <Notice kind="info">
            {state.emailed
              ? `Invite emailed to ${state.email}.`
              : `Invite created, but the email could not be sent. Send ${state.email} this link yourself.`}{" "}
            The link works once, for 72 hours, for whoever opens it. This is the only time it is shown.
          </Notice>
          <input readOnly value={state.link} className={`${inputClass} font-mono text-sm`} aria-label="Invite link" />
        </div>
      )}
    </div>
  );
}
