import type { ReactNode } from "react";
import { StatusChip } from "./status-chip";

// Product frames drawn in HTML. Each screen uses the words the real app shows
// (apps/mobile and /overview), with demo data. They are decorative copies of the
// app, so assistive tech gets one label per frame instead of every line.

export function PhoneFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className="mx-auto w-[260px] rounded-[36px] border border-line bg-night p-2.5 shadow-float">
      <div className="overflow-hidden rounded-[28px] bg-surface">
        <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[11px] font-semibold text-ink tabular-nums">
          <span>9:12</span>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] text-ink-muted">No signal</span>
        </div>
        <div aria-hidden className="space-y-3 px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function BrowserFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-float">
      <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-4 py-3">
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="ml-3 truncate rounded-md bg-surface px-3 py-1 text-[11px] text-ink-faint">alarsio · overview</span>
      </div>
      <div aria-hidden>{children}</div>
    </div>
  );
}

function Title({ back, children }: { back: string; children: string }) {
  return (
    <div>
      <p className="text-[11px] text-link">‹ {back}</p>
      <p className="mt-1 text-lg font-bold text-ink">{children}</p>
    </div>
  );
}

function FakeButton({ children, secondary }: { children: string; secondary?: boolean }) {
  return (
    <div className={`rounded-xl py-2.5 text-center text-sm font-semibold ${secondary ? "border border-line text-ink" : "bg-accent text-ink"}`}>
      {children}
    </div>
  );
}

export function CheckInScreen() {
  return (
    <>
      <Title back="Sites">Baner Residency, Tower A</Title>
      <div className="rounded-2xl border border-line p-3">
        <p className="text-[11px] font-semibold text-ink-muted">Checked in · 8:47</p>
        <p className="mt-1 text-xs text-ink">About 40 m from the site, limit 200 m</p>
        <div className="mt-2">
          <StatusChip tone="ok">On the server</StatusChip>
        </div>
      </div>
      <FakeButton>Check out</FakeButton>
      <FakeButton secondary>Day register</FakeButton>
    </>
  );
}

const REGISTER: [string, string, "ok" | "warn" | "wait"][] = [
  ["Ramesh Patil", "Present", "ok"],
  ["Suresh Jadhav", "Present", "ok"],
  ["Ganesh Shinde", "Half day", "warn"],
  ["Mahesh Pawar", "Present · 2 h OT", "ok"],
  ["Anil Kamble", "Leave", "wait"]
];

export function RegisterScreen() {
  return (
    <>
      <Title back="Site">Day register</Title>
      <FakeButton>Mark everyone present</FakeButton>
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {REGISTER.map(([name, status, tone]) => (
          <li key={name} className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium text-ink">{name}</span>
            <StatusChip tone={tone}>{status}</StatusChip>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-muted">Saved on this phone, waiting to send</p>
    </>
  );
}

export function ReportScreen() {
  return (
    <>
      <Title back="Site">Daily report</Title>
      <div className="rounded-2xl border border-line p-3">
        <p className="text-[11px] font-semibold text-ink-muted">Headcount</p>
        <p className="text-2xl font-bold text-ink tabular-nums">18</p>
        <p className="text-[11px] text-ink-muted">From today&apos;s attendance</p>
      </div>
      <div className="space-y-1.5 rounded-2xl border border-line p-3 text-xs text-ink">
        <p><span className="font-semibold">Work done:</span> 3rd floor slab shuttering</p>
        <p><span className="font-semibold">Blocker:</span> Steel delivery late</p>
        <p><span className="font-semibold">Safety:</span> Nothing to flag</p>
      </div>
      <FakeButton>Save and file</FakeButton>
    </>
  );
}

export function MaterialsScreen() {
  return (
    <>
      <Title back="Materials">Cement (bags)</Title>
      <div className="rounded-2xl border border-line p-3">
        <p className="text-[11px] font-semibold text-ink-muted">Estimated balance</p>
        <p className="text-2xl font-bold text-ink tabular-nums">42</p>
        <div className="mt-1">
          <StatusChip tone="warn">Low stock</StatusChip>
        </div>
      </div>
      <ul className="space-y-1.5 text-xs text-ink tabular-nums">
        <li className="flex justify-between"><span>Receipt</span><span>+100</span></li>
        <li className="flex justify-between"><span>Usage</span><span>−58</span></li>
      </ul>
      <FakeButton>Record usage</FakeButton>
    </>
  );
}

const OVERVIEW: [string, string, "ok" | "warn" | "wait" | "bad", string][] = [
  ["Baner Residency, Tower A", "Report filed", "ok", "Attendance approved"],
  ["Hinjewadi Commercial Plaza", "Report sent back", "warn", "Attendance waiting for review"],
  ["Wakad Row Houses, Phase 2", "Not filed", "bad", "No attendance recorded"]
];

// `inset` widens the left padding where the hero's phone overlaps the frame.
export function OverviewScreen({ inset = false }: { inset?: boolean }) {
  return (
    <div className={`p-5 ${inset ? "sm:pl-20" : ""}`}>
      <p className="text-sm font-bold text-ink">Overview · Wednesday</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[["Active sites", "3"], ["Reports filed", "1"], ["Low stock", "1"]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-canvas p-2.5">
            <p className="text-[10px] text-ink-muted">{k}</p>
            <p className="text-lg font-bold text-ink tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
        {OVERVIEW.map(([site, report, tone, attendance]) => (
          <li key={site} className="space-y-1.5 px-3 py-2.5">
            <p className="text-xs font-semibold text-ink">{site}</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusChip tone={tone}>{report}</StatusChip>
              <span className="text-[11px] text-ink-muted">{attendance}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
