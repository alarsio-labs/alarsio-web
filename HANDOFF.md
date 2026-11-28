# HANDOFF

**Goal:** Phase 2 advances (#239, ADR-054) on phone and web, with no rule-4 reads. Phase 4 Cash book (#258) waits on the team.
**Completed:** Merged: Phases 1 and 3, server #248, and #254 to #257, #259, #260 (phone, web, wage balance, phone mirror, reversal day, view `worker_advance_lines`). `SECURITY.md` pass, module-guard and doc-keeper done.
**Open PRs (5 of 5 checks pass, need review):** #271 docs (ADR-054 A2 reversal day; one advances section in `FEATURES.md`). #272 the wage page and the phone mirror read `worker_advance_lines`, not the table.
**Next step:** 1) Anuradha reviews #271 and #272. 2) Optional browser check of the wage page against the view (needs Docker and local Supabase). 3) Phase 4 Cash book once the team answers on #258.
**Open decisions:** #258 (Cash book); advances as a tenth module; may a supervisor cancel an owner's advance (gap 2).
**Not checked:** whether the phone wipes `mirror_advances` on sign-out (it stays on disk until another user pulls; the app hides it).
**Key files:** `supabase/migrations/20261127*`, `20261128*`, `supabase/tests/worker_advances_test.sql`, `apps/mobile/src/sync/supabase-mirror-source.ts`, `apps/web/src/app/(app)/wages/[period]/page.tsx`, `apps/web/src/lib/advances/`.
**Commands:** `gh pr checks <n> --repo alarsio-labs/alarsio-web`; `PREFLIGHT_NO_FEATURE_TICK=1 bash scripts/preflight.sh` (slow, run in background).
**Rules:** No push or GitHub write without approval. Stage files by name. Never stage `AGENTS.md` or `apps/web/AGENTS.md`. A migration PR must change `docs/FEATURES.md`. Check a PR is still open before you push to it. Local `main` is stale: diff against `origin/main`.
