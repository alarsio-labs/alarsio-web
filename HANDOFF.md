# HANDOFF

**Goal:** Phase 2 advances (#239, ADR-054): record advances on the phone and the web. Phase 4 Cash book is next.
**Completed:** Phases 1 and 3 merged. PR #248 (server) merged. Open PRs: #254 (phone), #255 (web, `feat/advances-web`), #256 (web balance line, base #255), #257 (phone mirror of server advances, base #254).
**Scope:** the phone shows this and last month's advances from the server too (mirror, migration 12). The web wage page has an earned / advances / left card. No rate or pay on the phone.
**Next step:** 1) Anuradha reviews #254, #255, #256, #257. 2) Merge in that order. 3) Phase 4 Cash book (needs a spec).
**Open question:** the phone mirror reads the `worker_advances` table under RLS, not a view (ARCHITECTURE rule 4). Ask the team if they want a row-level view.
**Later:** browser check of the web pages (needs local Supabase); `docs/SECURITY.md` pass; module-guard, doc-keeper (preflight does not run them).
**Key files (phone):** `apps/mobile/src/advances/`, `sync/pull.ts` (`readSiteAdvances`), `db/migrations.ts` (v12).
**Key files (web):** `apps/web/src/app/(app)/advances/`, `wages/[period]/page.tsx`, `lib/advances/` (`balance.ts`).
**Commands:** `pnpm exec jest src/advances src/sync src/db` (in `apps/mobile`); `PREFLIGHT_NO_FEATURE_TICK=1 bash scripts/preflight.sh` (slow, run in background).
**Notes:** `SitesScreen` and `SignInScreen` tests time out under load; they pass alone. Never stage `AGENTS.md` or `apps/web/AGENTS.md`. No push without approval.
