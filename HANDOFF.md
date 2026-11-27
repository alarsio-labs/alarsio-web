# HANDOFF

**Goal:** Phase 2 advances (#239, ADR-054): record advances on the phone and server. Phase 4 Cash book is next.
**Completed:** Phases 1 and 3 merged. PR #248 (server, `feat/advances-server`) open. PR #254 (phone, `feat/advances-phone`) open, stacked on #248.
**Scope cut:** phone lists only advances saved on this phone. No server mirror, no rate or pay, no balance line.
**Next step:** 1) Review #248, then #254. 2) Merge #248 first. 3) Change #254 base to `main`, then merge.
**Later:** web advances screen and balance line; phone mirror of server advances; Phase 4 Cash book.
**Key files (phone):** `apps/mobile/src/advances/` (`advance.ts`, `advance-store.ts`), `screens/SiteAdvancesScreen.tsx`, `app/advances/[siteId].tsx`, `db/migrations.ts` (v11), `sync/entities.ts`.
**Key files (server):** `sync_worker_advances` handler in `supabase/migrations/`, SQL tests in `supabase/tests/`.
**Commands:** `pnpm exec jest src/advances src/screens/__tests__/SiteAdvancesScreen` (in `apps/mobile`); `PREFLIGHT_NO_FEATURE_TICK=1 bash scripts/preflight.sh` (slow, run in background).
**Notes:** `SitesScreen` and `SignInScreen` tests time out under load; they pass alone. Never stage `AGENTS.md` or `apps/web/AGENTS.md`. No push without approval.
