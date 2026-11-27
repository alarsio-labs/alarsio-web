# HANDOFF

**Goal:** Phase 2 advances (#239, ADR-054): record advances on the phone and the web. Phase 4 Cash book is next.
**Completed:** Phases 1 and 3 merged. PR #248 (server) merged. PR #254 (phone, `feat/advances-phone`) and PR #255 (web, `feat/advances-web`) are open on `main`, with main merged in.
**Scope cut:** phone lists only advances saved on this phone. No server mirror, no rate or pay, no balance line on phone or web.
**Next step:** 1) Review #254 and #255. 2) Merge both. 3) Then the earned / left balance line and the phone mirror of server advances.
**Later:** Phase 4 Cash book; `docs/SECURITY.md` pass; /review, /security-review, module-guard, doc-keeper (preflight does not run them).
**Key files (phone):** `apps/mobile/src/advances/`, `screens/SiteAdvancesScreen.tsx`, `app/advances/[siteId].tsx`, `db/migrations.ts` (v11).
**Key files (web):** `apps/web/src/app/(app)/advances/` (`page.tsx`, `actions.ts`), `lib/advances/` (`input.ts`, `rows.ts`), `lib/dashboard/links.ts`.
**Commands:** `pnpm exec jest src/advances src/screens/__tests__/SiteAdvancesScreen` (in `apps/mobile`); `PREFLIGHT_NO_FEATURE_TICK=1 bash scripts/preflight.sh` (slow, run in background).
**Notes:** `SitesScreen` and `SignInScreen` tests time out under load; they pass alone. Never stage `AGENTS.md` or `apps/web/AGENTS.md`. No push without approval.
