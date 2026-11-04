"use client";

import { useRef, useState, useTransition } from "react";
import { Notice, buttonClass } from "@/components/form";
import { CsvError, parseCsv } from "@/lib/workers/csv";
import { IMPORT_RULES, reasonText } from "@/lib/workers/import-result";
import { checkFile, looksMisencoded, readRosterTable, type ImportRow } from "@/lib/workers/roster-file";
import { importWorkers, type ImportResultRow } from "./actions";

type Parsed = { name: string; rows: ImportRow[]; lines: number[]; warnings: string[] };
type Result = ImportResultRow & { line: number };

async function readFile(file: File): Promise<unknown[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    if (looksMisencoded(text)) {
      throw new CsvError("Some letters could not be read. Save the file as \"CSV UTF-8\", or as .xlsx, and pick it again.");
    }
    return parseCsv(text);
  }
  // Loaded only when someone picks an Excel file. Read in the browser: the
  // file itself is never uploaded, only the rows. Only the first sheet is read.
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(file)) as unknown[][];
}

export function ImportPanel({ orgId }: { orgId: string }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A slower read of an earlier file must not replace a newer one.
  const readId = useRef(0);

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    // Clear the input so picking the same, corrected file fires again.
    input.value = "";
    const id = ++readId.current;
    setParsed(null);
    setProblems([]);
    setResults(null);
    setError(null);
    if (!file) return;
    const fileProblem = checkFile(file.name, file.size);
    if (fileProblem) {
      setProblems([fileProblem]);
      return;
    }
    try {
      const roster = readRosterTable(await readFile(file));
      if (id !== readId.current) return;
      if (roster.problems.length > 0) setProblems(roster.problems);
      else setParsed({ name: file.name, rows: roster.rows, lines: roster.lines, warnings: roster.warnings });
    } catch (e) {
      if (id !== readId.current) return;
      setProblems([e instanceof CsvError ? e.message : "The file could not be read. Check it is a real .csv or .xlsx file."]);
    }
  };

  const onImport = () => {
    if (!parsed) return;
    const { rows, lines } = parsed;
    startTransition(async () => {
      try {
        const outcome = await importWorkers(orgId, rows);
        if (outcome.ok) {
          setResults(outcome.results.map((r) => ({ ...r, line: lines[r.row - 1] ?? r.row + 1 })));
          setParsed(null);
        } else {
          setError(outcome.message);
        }
      } catch {
        setError("The import could not be sent. Check your connection and try again. Nothing was saved.");
      }
    });
  };

  const count = (kind: ImportResultRow["result"]) => results?.filter((r) => r.result === kind).length ?? 0;
  const failed = results?.filter((r) => r.result === "rejected" || r.result === "skipped") ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        A .csv or .xlsx file (only the first sheet is read) with the columns Worker code, Name, Trade, Pay type
        (daily or hourly) and, optionally, Phone. An existing worker code updates that worker; a blank phone keeps
        the phone already saved. Wage rates are set on each worker&apos;s page.{" "}
        <a href="/workers-template.csv" download className="underline">Download a template</a>
      </p>
      <input
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => void onFile(e.currentTarget)}
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
          {parsed.warnings.map((w) => (
            <Notice key={w} kind="error">{w}</Notice>
          ))}
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
            <>
              <ul className="divide-y divide-neutral-200 border border-neutral-200 bg-white text-sm">
                {failed.map((r) => (
                  <li key={r.row} className="px-3 py-2">
                    Line {r.line}{r.code ? ` (${r.code})` : ""}: {reasonText(r.reason)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-neutral-500">{IMPORT_RULES}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
