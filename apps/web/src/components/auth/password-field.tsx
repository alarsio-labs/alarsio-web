"use client";

import { useId, useState } from "react";
import { passwordStrength } from "@/lib/auth/strength";

/**
 * A password field with a Show/Hide button. It draws its own label (a button must not sit
 * inside a <label>) and posts the value under `name`. With `meter`, a new password gets a
 * four-step bar and a word, so the person sees the rule before they submit.
 */
export function PasswordField({
  label,
  name,
  autoComplete,
  hint,
  minLength,
  meter = false
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  minLength?: number;
  meter?: boolean;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState("");
  const strength = meter ? passwordStrength(value, minLength ?? 8) : null;
  const describedBy = [hint ? `${id}-hint` : null, strength ? `${id}-meter` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="sx-field">
      <label htmlFor={id} className="sx-label">
        {label}
      </label>
      <div className="sx-pw">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          aria-describedby={describedBy}
          className="sx-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className="sx-pw-btn"
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {strength && (
        <div id={`${id}-meter`} className="sx-meter" data-level={strength.level} aria-live="polite">
          <span className="sx-meter-bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="sx-meter-word">{strength.word}</span>
        </div>
      )}
      {hint && (
        <span id={`${id}-hint`} className="sx-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
