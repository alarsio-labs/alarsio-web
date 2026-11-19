# HANDOFF
**Goal:** Labour Book-style attendance on the phone. Phase 1 = worker month view (issue #234).
**Completed:** Branch `feat/attendance-worker-month` pushed. PR #235 open, CI green (5/5). ADR-053 written. `/code-review` run (5 of 10 fixed). `/security-review` run, no findings; box ticked in PR body. Comment posted on #234 for Manish.
**Blocked on:** Manish's PR1 (view `attendance_month_entries`) and his answers on #234 (`note` column, ex-workers, failing-view policy). Do not merge #235 before PR1. PR needs a review.
**Next step:** Read Manish's replies on #234, then fix what he decides. Open review items: 3 (bad view fails whole pull, needs ADR-023 decision), 5 (3 s polling), 8 (editor/styles copied), 9 (6000 one-by-one inserts), 10 (stale month past midnight).
**Not done:** `docs/FEATURES.md` update, test on a real phone offline, `docs/SECURITY.md` line-by-line pass, Phase 2 (advance + balance), Phase 3 (WhatsApp share), Phase 4 (Cash book, needs team decision).
**Key files:** `apps/mobile/src/attendance/month-store.ts`, `sync/pull.ts`, `screens/WorkerMonthScreen.tsx`, `db/migrations.ts` (v9), `docs/DECISIONS.md` (ADR-053).
**Commands:** `gh pr view 235 --repo alarsio-labs/alarsio-web`, `gh issue view 234 --repo alarsio-labs/alarsio-web --comments`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `bash scripts/preflight.sh` (Git Bash).
**Rules:** No GitHub write without approval of the exact command. Stage files by name; one commit per file.
