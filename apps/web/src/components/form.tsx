import type { ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900";

export const buttonClass =
  "w-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700";

export function Notice({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  const tone = kind === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-neutral-300 bg-neutral-50 text-neutral-800";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${tone}`}>
      {children}
    </p>
  );
}

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}
