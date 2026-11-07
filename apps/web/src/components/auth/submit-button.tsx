"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

// After this long a slow connection is likely, so the button says so instead of just spinning.
const SLOW_MS = 6000;

/**
 * The form's main button. While the form is sending it shows a spinner and `pendingLabel`,
 * refuses a second tap, and the form dims its fields (auth.css, form:has([aria-busy])). If the
 * answer is slow, a line under the button says it is still working.
 */
export function SubmitButton({
  label,
  pendingLabel,
  variant = "red"
}: {
  label: string;
  pendingLabel: string;
  variant?: "red" | "ink";
}) {
  const { pending } = useFormStatus();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [pending]);

  return (
    <div className="sx-submit">
      <button
        type="submit"
        className={`sx-btn sx-btn-${variant}`}
        aria-busy={pending || undefined}
        aria-disabled={pending || undefined}
        onClick={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <span className="sx-spin" aria-hidden="true" />
        <span className="sx-btn-label">{pending ? pendingLabel : label}</span>
      </button>
      <p className="sx-slow" role="status" aria-live="polite">
        {slow ? "Still working. A slow connection can take a little longer." : ""}
      </p>
    </div>
  );
}
