# HANDOFF
**Goal:** Labour Book-style attendance on the phone. Phase 3 = text day slip for WhatsApp (issue #183).
**Completed:** Phase 1 (worker month, #234, #244) merged; phone offline test passed. Phase 3 built on `feat/attendance-day-slip` and pushed. PR #247 is open: 5 of 5 checks pass, review required. Auto-fix could not be turned on (app could not match the repo).
**Next step:** Try "Share day slip" on the phone (Expo Go). Then get a review on PR #247 (`gh pr view 247 --repo alarsio-labs/alarsio-web --comments`).
**Open items:** Phase 3 scope is not confirmed by the team (FEATURES.md lists WhatsApp/SMS as not in MVP). Phase 2 (advance + balance) waits on replies in #237 and #239.
**Not done:** image slip (needs `expo install expo-sharing react-native-view-shot`), Phase 4 Cash book, `docs/SECURITY.md` line-by-line pass, FEATURES.md update. Branch `docs/handoff-after-244` has 3 unpushed HANDOFF commits.
**Key files:** `apps/mobile/src/attendance/day-slip.ts`, `screens/SiteAttendanceScreen.tsx`, `i18n/en.json`, `i18n/hi.json`.
**Commands:** `pnpm --filter mobile test -- SiteAttendanceScreen day-slip`, `pnpm typecheck`, `pnpm lint`, `gh issue view 183 --repo alarsio-labs/alarsio-web --comments`.
**Rules:** No GitHub write without approval of the exact command. Stage files by name; one commit per file. Branch from `main` for new work.
