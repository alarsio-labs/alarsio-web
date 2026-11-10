#!/usr/bin/env node
// Project PostToolUse hook: lint the one file Claude just edited, with that workspace's ESLint config.
// Lints a single file only; the full `pnpm lint` still runs in preflight and CI.
// Exit 2 feeds the lint errors back to Claude. Anything unexpected (no eslint installed yet,
// a file outside a workspace) exits 0 so it never blocks work.
import { readFileSync, existsSync } from "node:fs";
import { relative, resolve, sep, join } from "node:path";
import { spawnSync } from "node:child_process";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const file = input?.tool_input?.file_path;
if (!file) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = relative(root, resolve(root, file)).split(sep).join("/");
const m = rel.match(/^((?:apps|packages)\/[^/]+)\/(.+\.(?:ts|tsx|js|jsx|mjs))$/);
if (!m) process.exit(0);

const ws = join(root, m[1]);
const eslint = join(ws, "node_modules", "eslint", "bin", "eslint.js");
if (!existsSync(eslint)) process.exit(0);

const r = spawnSync(process.execPath, [eslint, "--no-warn-ignored", m[2]], {
  cwd: ws,
  encoding: "utf8",
  timeout: 55_000,
});
if (r.status === 1) {
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().slice(0, 4000);
  process.stderr.write(`ESLint found problems in ${rel}. Fix them before moving on:\n${out}\n`);
  process.exit(2);
}
process.exit(0);
