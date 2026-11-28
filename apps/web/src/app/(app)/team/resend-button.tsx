"use client";

import { useActionState } from "react";
import { Notice } from "@/components/form";
import { Button } from "@/components/app/button";
import { SentNotice } from "./invite-form";
import { resendInvite, type InviteState } from "./actions";

export function ResendButton({ orgId, inviteId }: { orgId: string; inviteId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(resendInvite, { status: "idle" });

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="invite_id" value={inviteId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Sending…" : "Resend"}
      </Button>
      {state.status === "error" && <Notice kind="error">{state.message}</Notice>}
      {state.status === "sent" && <SentNotice state={state} />}
    </form>
  );
}
