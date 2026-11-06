"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { describeDay, levelOf, monthLabels, sampleSeason, seasonStats, shortDate } from "@/lib/landing/sample-site";

// A season of one sample site, one square per day (docs/DESIGN.md v2.1, section 2). Tap or
// hover a day to read it; with the keyboard, Tab reaches the grid once and the arrow keys move
// a day (up/down) or a week (left/right). Plain DOM and CSS: no canvas, no chart library.
export function SeasonHeatmap() {
  const days = useMemo(() => sampleSeason(), []);
  const stats = useMemo(() => seasonStats(days), [days]);
  const months = useMemo(() => monthLabels(days), [days]);
  const lastWorked = useMemo(() => days.reduce((at, d, i) => (d.worked ? i : at), 0), [days]);
  const [active, setActive] = useState(lastWorked);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (to: number) => {
    const i = Math.max(0, Math.min(days.length - 1, to));
    setActive(i);
    cells.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    move(active + step);
  };
  const day = days[active];

  return (
    <div className="hm-heat">
      <dl className="hm-heat-stats">
        <div>
          <dt>Busiest day</dt>
          <dd>{stats.busiest ? `${stats.busiest.present} present` : "—"}</dd>
          <p>{stats.busiest ? shortDate(stats.busiest.date) : ""}</p>
        </div>
        <div>
          <dt>Average present</dt>
          <dd>{stats.averagePresent} a day</dd>
          <p>over {stats.workedDays} working days</p>
        </div>
        <div>
          <dt>Reports in a row</dt>
          <dd>{stats.longestReportRun} days</dd>
          <p>longest run, Sundays skipped</p>
        </div>
      </dl>

      <div className="hm-heat-scroll">
        <div className="hm-heat-months" aria-hidden="true">
          {months.map((m) => (
            <span key={m.week} style={{ gridColumn: m.week + 1 }}>{m.label}</span>
          ))}
        </div>
        <div className="hm-heat-grid" role="grid" aria-label="Sample site: one square per day" onKeyDown={onKey}>
          {days.map((d, i) => (
            <button
              key={d.date}
              ref={(el) => {
                cells.current[i] = el;
              }}
              type="button"
              role="gridcell"
              tabIndex={i === active ? 0 : -1}
              className="hm-cell"
              data-level={levelOf(d)}
              data-active={i === active ? "" : undefined}
              aria-label={describeDay(d)}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
            />
          ))}
        </div>
      </div>

      <div className="hm-heat-foot">
        <p className="hm-heat-day" aria-live="polite">{day ? describeDay(day) : ""}</p>
        <p className="hm-heat-legend" aria-hidden="true">
          Fewer <i data-level="0" /><i data-level="1" /><i data-level="2" /><i data-level="3" /><i data-level="4" /> More
        </p>
      </div>
    </div>
  );
}
