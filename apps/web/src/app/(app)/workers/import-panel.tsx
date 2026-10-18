"use client";

import { useState, useTransition } from "react";
import { Notice, buttonClass } from "@/components/form";
import { parseCsv } from "@/lib/workers/csv";
import { readRosterTable, type ImportRow } from "@/lib/workers/roster-file";
import { importWorkers, type ImportResultRow } from "./actions";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const REASON: Record<string, string> = {
  invalid_value: "a value is missing or not allowed (pay type must be daily or hourly)",
  not_permitted: "not allowed",
  anonymized: "this worker was removed and cannot be changed"
};

type Parsed = { name: string; rows: ImportRow[] };

async function readFile(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) {
    // Loaded only when someone picks an Excel file. Read in the browser: the
    // file itself is never uploaded, only the rows.
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as unknown[][];
  }
  throw new Error("Choose a .csv or .xlsx file. For an older .xls file, save it as .xlsx first.");
}

export function ImportPanel({ orgId }: { orgId: string }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [results, setResults] = useState<ImportResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onFile = async (file: File | undefined) => {
    setParsed(null);
    setProblems([]);
    setResults(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setProblems(["The file is larger than 5 MB. Split it into smaller files."]);
      return;
    }
    try {
      const roster = readRosterTable(await readFile(file));
      if (roster.problems.length > 0) setProblems(roster.problems);
      else setParsed({ name: file.name, rows: roster.rows });
    } catch (e) {
      setProblems([e instanceof Error && e.message.startsWith("Choose") ? e.message : "The file could not be read."]);
    }
  };

  const onImport = () => {
    if (!parsed) return;
    startTransition(async () => {
      const outcome = await importWorkers(orgId, parsed.rows);
      if (outcome.ok) {
        setResults(outcome.results);
        setParsed(null);
      } else {
        setError(outcome.message);
      }
    });
  };

  const count = (kind: ImportResultRow["result"]) => results?.filter((r) => r.result === kind).length ?? 0;
  const failed = results?.filter((r) => r.result === "rejected" || r.result === "skipped") ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        A .csv or .xlsx file with the columns Worker code, Name, Trade, Pay type (daily or hourly) and,
        optionally, Phone. An existing worker code updates that worker. Wage rates are set separately.{" "}
        <a href="/workers-template.csv" download className="underline">Download a template</a>
      </p>
      <input
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => void onFile(e.target.files?.[0])}
        className="block w-full text-sm"
        aria-label="Worker file"
      />

      {problems.length > 0 && (
        <Notice kind="error">
          {problems.map((p) => (
            <span key={p} className="block">{p}</span>
          ))}
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}

      {parsed && (
        <div className="space-y-3">
          <Notice kind="info">
            {parsed.name}: {parsed.rows.length} {parsed.rows.length === 1 ? "worker" : "workers"} ready to import.
          </Notice>
          <button type="button" onClick={onImport} disabled={pending} className={buttonClass}>
            {pending ? "Importing…" : `Import ${parsed.rows.length}`}
          </button>
        </div>
      )}

      {results && (
        <div className="space-y-3">
          <Notice kind="info">
            {count("created")} added · {count("updated")} updated · {count("rejected")} rejected · {count("skipped")} skipped
          </Notice>
          {failed.length > 0 && (
            <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
              {failed.map((r) => (
                <li key={r.row} className="px-3 py-2">
                  Row {r.row + 1}{r.code ? ` (${r.code})` : ""}: {REASON[r.reason ?? ""] ?? "could not be saved"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
