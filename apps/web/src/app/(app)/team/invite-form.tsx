"use client";

import { useActionState, useState } from "react";
import { APP_ROLES } from "@alarsio/types";
import { Field, Notice, buttonBase, buttonClass, inputClass } from "@/components/form";
import { ROLE_LABEL } from "@/lib/dashboard/memberships";
import { createInvite, type InviteState } from "./actions";

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false); // the box above stays selectable, so the owner can copy by hand
    }
  };
  return (
    <button type="button" onClick={copy} className={buttonBase}>
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

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
          <input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} font-mono text-sm`} aria-label="Invite link" />
          <CopyLink link={state.link} />
        </div>
      )}
    </div>
  );
}
