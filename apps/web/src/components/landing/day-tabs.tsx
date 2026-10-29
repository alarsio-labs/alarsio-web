"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Tab } from "@/lib/landing/content";
import { CheckInScreen, MaterialsScreen, PhoneFrame, RegisterScreen, ReportScreen } from "./screens";

const SCREENS: Record<Tab["id"], { label: string; screen: ReactNode }> = {
  "check-in": { label: "Phone screen: checked in at the site, on the server", screen: <CheckInScreen /> },
  attendance: { label: "Phone screen: the day register with each worker's status", screen: <RegisterScreen /> },
  report: { label: "Phone screen: a daily report with headcount from attendance", screen: <ReportScreen /> },
  materials: { label: "Phone screen: cement balance with a low stock warning", screen: <MaterialsScreen /> }
};

// The tabbed feature panel (DESIGN.md section 3), with the ARIA tabs pattern:
// arrow keys move between tabs, and only the active tab is in the tab order.
export function DayTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = tabs[active];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (from + step + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  };

  if (!tab) return null;
  return (
    <div className="grid gap-8 rounded-3xl bg-surface p-6 lg:grid-cols-[220px_1fr_1fr] lg:items-center lg:gap-10 lg:p-10">
      <div role="tablist" aria-label="A day on site" aria-orientation="vertical" className="-mx-2 flex gap-2 overflow-x-auto px-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {tabs.map((t, i) => {
          const selected = i === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-xl border-l-4 px-4 text-left text-base font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                selected ? "border-accent bg-canvas text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
              {selected && <span aria-hidden className="hidden lg:inline">→</span>}
            </button>
          );
        })}
      </div>

      <PhoneFrame label={SCREENS[tab.id].label}>{SCREENS[tab.id].screen}</PhoneFrame>

      <div id={`panel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`}>
        <p className="text-sm font-semibold text-ink-muted lg:text-base">{tab.eyebrow}</p>
        <h3 className="mt-2 text-2xl font-bold tracking-[-0.01em] text-ink lg:text-3xl">{tab.title}</h3>
        <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">{tab.body}</p>
      </div>
    </div>
  );
}
