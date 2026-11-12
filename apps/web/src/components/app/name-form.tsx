"use client";

import { useActionState } from "react";
import { NAME_MAX } from "@/lib/profile-name";
import type { NameState } from "@/app/(app)/account-actions";

type Action = (prev: NameState, form: FormData) => Promise<NameState>;

const IDLE: NameState = { status: "idle" };

// "Your name" in the account menu. The team sees this name on sites, invites and reviews.
export function NameForm({ name, action }: { name: string | null; action: Action }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const note = state.status === "error" ? state.message : state.status === "saved" ? "Saved." : "Your team sees this name.";
  return (
    <form action={formAction} className="cx-name">
      <label className="cx-account-label" htmlFor="cx-name-input">Your name</label>
      <div className="cx-name-row">
        <input
          id="cx-name-input"
          name="full_name"
          defaultValue={state.status === "saved" ? state.name : (name ?? "")}
          placeholder="e.g. Ramesh Kumar"
          maxLength={NAME_MAX}
          required
          autoComplete="name"
          aria-describedby="cx-name-note"
        />
        <button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p id="cx-name-note" className={state.status === "error" ? "cx-name-error" : "cx-account-label"} role="status">
        {note}
      </p>
    </form>
  );
}
