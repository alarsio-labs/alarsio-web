import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./nav-icon";

// One number on a working screen (docs/DESIGN.md section 4). With `alertAbove0`, a
// value above 0 turns amber and gets a dot: "to approve" and "low stock" ask for
// action, 0 does not. The optional pieces only ever show counts the page loaded:
// `href` draws the round ↗ link to the page behind the number, `foot` and `footEnd`
// the line under it, and `progress` a bar (none when there is nothing to measure).

export type Progress = { value: number; max: number };

/** The bar's filled share, 0 to 100; null when there is nothing to measure. */
export function progressPercent(p: Progress | undefined): number | null {
  if (!p || p.max <= 0) return null;
  return Math.round((Math.min(Math.max(p.value, 0), p.max) / p.max) * 100);
}

export function StatCard({
  label,
  value,
  alertAbove0 = false,
  unit,
  href,
  foot,
  footEnd,
  progress
}: {
  label: string;
  value: number;
  alertAbove0?: boolean;
  unit?: string;
  href?: string;
  foot?: ReactNode;
  footEnd?: ReactNode;
  progress?: Progress;
}) {
  const alert = alertAbove0 && value > 0;
  const pct = progressPercent(progress);
  return (
    <div className={`ax-stat${alert ? " ax-stat-alert" : ""}`}>
      <div className="ax-stat-top">
        <p className="ax-stat-label">{label}</p>
        {href && (
          <Link href={href} className="ax-stat-link" aria-label={`Open ${label.toLowerCase()}`}>
            <Icon name="arrow-up-right" size={14} />
          </Link>
        )}
      </div>
      <p className="ax-stat-value">
        {value.toLocaleString("en-IN")}
        {unit && <span className="ax-stat-unit">{unit}</span>}
      </p>
      {(foot || footEnd) && (
        <p className="ax-stat-foot">
          <span>{foot}</span>
          {footEnd && <span>{footEnd}</span>}
        </p>
      )}
      {pct !== null && progress && (
        <div
          className="ax-meter"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={progress.max}
          aria-valuenow={Math.min(Math.max(progress.value, 0), progress.max)}
        >
          <span className="ax-meter-fill" style={{ width: `${pct}%` }} />
          <span className="ax-meter-mark" style={{ left: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
