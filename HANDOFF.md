# HANDOFF

**Goal:** Phase 2 advances (#239, ADR-054) on phone and web, with no rule-4 reads. Phase 4 Cash book (#258) waits on the team.
**Completed:** Merged: Phases 1 and 3, server #248. Open PRs: #254 phone, #255 web, #256 wage balance (base #255), #257 phone mirror (base #254), #259 reversal keeps the advance's day, #260 view `worker_advance_lines`. #259 and #260 pass 5 of 5 checks. `SECURITY.md` pass, module-guard and doc-keeper done; `ARCHITECTURE.md` fixes are on #257.
**Next step:** 1) Anuradha reviews #259, #260, #254 to #257. Merge #259 and #260 first, then #254 to #257. 2) After #260 merges, rebase #256 and #257 on `main`. Then #256 (`wages/[period]/page.tsx`, line 90) and #257 (`supabase-mirror-source.ts`, `advances`) read `worker_advance_lines`; fix the mirror text in `ARCHITECTURE.md`. 3) Add the reversal-day line to ADR-054 (A2) on #259.
**Open decisions:** Team answers on #258 and on advances as a tenth module.
**Not checked:** web `lib/advances/input.ts`; whether the phone wipes `mirror_advances` on sign-out; browser check of the web pages (needs local Supabase).
**Key files:** `supabase/migrations/20261127*`, `20261128100000_advance_reversal_same_day.sql`, `20261128110000_worker_advance_lines.sql`, `supabase/tests/worker_advances_test.sql`, `apps/mobile/src/sync/pull.ts`, `apps/web/src/lib/advances/`.
**Commands:** `gh pr checks <n> --repo alarsio-labs/alarsio-web`; `PREFLIGHT_NO_FEATURE_TICK=1 bash scripts/preflight.sh` (slow, run in background).
**Rules:** No push or GitHub write without approval. Stage files by name. Never stage `AGENTS.md` or `apps/web/AGENTS.md`. A migration PR must change `docs/FEATURES.md`. Local `main` is stale: diff against `origin/main`.
