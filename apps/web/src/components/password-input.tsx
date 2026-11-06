"use client";

import { useId, useState } from "react";
import { authInput } from "@/components/v2-form";

/**
 * A password field with a Show/Hide button, in the auth form's look. It draws its own label
 * (the button must not sit inside a <label>) and posts the value under `name` like a plain input.
 */
export function PasswordInput({
  label,
  name,
  autoComplete,
  hint,
  minLength
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  minLength?: number;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className="au-field-row">
      <label htmlFor={id} className="lp-mono">
        {label}
      </label>
      <div className="au-pw">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`${authInput} au-pw-input`}
        />
        <button
          type="button"
          className="au-pw-btn lp-mono"
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {hint && (
        <span id={`${id}-hint`} className="lp-mono lp-muted au-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
