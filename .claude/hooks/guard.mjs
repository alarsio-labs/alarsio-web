#!/usr/bin/env node
// Project PreToolUse guard for file edits (Edit, Write, MultiEdit).
// Turns two rules from CLAUDE.md into hard blocks:
//   - Migrations are append-only: a migration already on origin/main is never edited.
//   - The service-role key is used nowhere: no `service_role` under apps/, packages/ or supabase/
//     (the same rule CI's scope-guard job checks after the push).
// Exit 2 blocks the call and shows stderr to Claude. Any internal error lets the call through.
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

function block(msg) {
  process.stderr.write(`Blocked by .claude/hooks/guard.mjs: ${msg}\n`);
  process.exit(2);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const ti = input?.tool_input ?? {};
if (!ti.file_path) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = relative(root, resolve(root, ti.file_path)).split(sep).join("/");
if (rel.startsWith("..")) process.exit(0);

// Append-only migrations
if (/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) {
  let merged = false;
  try {
    execFileSync("git", ["cat-file", "-e", `origin/main:${rel}`], { cwd: root, stdio: "ignore" });
    merged = true;
  } catch {
    merged = false;
  }
  if (merged) {
    block(`${rel} is already on origin/main. Migrations are append-only: write a new migration instead.`);
  }
}

// No service_role in source
const text = [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])]
  .filter((s) => typeof s === "string")
  .join("\n");
if (/^(apps|packages|supabase)\//.test(rel) && /service_role/i.test(text)) {
  block("`service_role` may not appear in apps/, packages/ or supabase/ (rule 2). Write a narrow SECURITY DEFINER function instead.");
}

process.exit(0);
