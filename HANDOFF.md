# HANDOFF
**Goal:** Labour Book-style attendance on the phone. Phase 1 = worker month view (issue #234).
**Completed:** PR #235 merged and approved (month screen, device mirror v9, ADR-053). `/code-review` run (5 of 10 fixed). `/security-review` run, no findings.
**Next step:** `git switch main; git pull origin main`. Then check #234 for Manish's answers (`note` column, ex-workers, failing-view policy) and whether his PR1 (view `attendance_month_entries`) is merged and deployed.
**Open items:** review items 3 (bad view fails whole pull, needs ADR-023 decision), 5 (3 s polling), 8 (editor/styles copied), 9 (6000 one-by-one inserts), 10 (stale month past midnight). `docs/FEATURES.md` not updated.
**Not done:** test on a real phone offline, `docs/SECURITY.md` line-by-line pass, Phase 2 (advance + balance, write the issue first), Phase 3 (WhatsApp share), Phase 4 (Cash book, needs team decision).
**Key files:** `apps/mobile/src/attendance/month-store.ts`, `sync/pull.ts`, `screens/WorkerMonthScreen.tsx`, `db/migrations.ts` (v9), `docs/DECISIONS.md` (ADR-053).
**Commands:** `gh issue view 234 --repo alarsio-labs/alarsio-web --comments`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `bash scripts/preflight.sh` (Git Bash).
**Rules:** No GitHub write without approval of the exact command. Stage files by name; one commit per file. Branch from `main` for new work.
