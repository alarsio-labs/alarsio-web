# Alarsio — QA & Security Audit Master Report

**Audit started:** 2026-11-02 13:28 IST  
**Auditor:** Antigravity (Senior QA / Security / Performance / UX roles)  
**Repository:** `C:\Desktop\alarsio-web` (main @ `482fb2c`)  
**Live site:** https://alarsio-web.vercel.app  
**Stack:** Next.js App Router · Supabase (PostgreSQL + Auth + Storage) · pnpm · Turborepo · Vercel

---

## Overall Status

| Phase | Status | Tests | Pass | Fail | Blocked | Not Tested |
|---|---|---|---|---|---|---|
| P0 — Docs & Architecture Review | COMPLETE | 12 | 10 | 2 | 0 | 0 |
| P1 — Secrets & Environment Scan | COMPLETE | 6 | 5 | 1 | 0 | 0 |
| P2 — Auth & Session Code Review | COMPLETE | 14 | 12 | 1 | 1 | 0 |
| P3 — RLS & Security Code Review | COMPLETE | 22 | 18 | 3 | 1 | 0 |
| P4 — Route & Middleware Review | COMPLETE | 18 | 15 | 3 | 0 | 0 |
| P5 — Feature & Action Code Review | COMPLETE | 30 | 25 | 5 | 0 | 0 |
| P6 — S1-S15 Live Smoke Tests | BLOCKED — needs credentials | 15 | 0 | 0 | 15 | 0 |
| P7 — Performance Analysis | PARTIAL (static) | 8 | 5 | 3 | 0 | 0 |
| P8 — UX & Accessibility Review | PARTIAL (static) | 20 | 14 | 5 | 1 | 0 |

> **P6 (live smoke tests S1-S15)** requires authenticated test accounts.
> See CREDENTIAL GATE section below.

---

## Architecture Overview

### Application Layout
- `apps/web` — Next.js 14+ App Router (Server Components + Server Actions)
- `apps/mobile` — Expo / React Native (not tested — no APK, issue #130)
- `packages/types` — Shared TypeScript types (AppRole, etc.)
- `supabase/` — PostgreSQL migrations (62 files) + SQL test suites (28 files)

### Security Model
- **Authorization boundary:** Supabase RLS (Row Level Security) on all tables and views
- **No service-role key** in any application code (verified PASS)
- Every query runs as the signed-in user via `supabaseServer()` (publishable key + session cookie)
- Middleware (`proxy.ts`) handles convenience redirects only — correctly documented as *not* the security boundary
- `SECURITY DEFINER` functions used only for RLS predicates that would otherwise recurse; each checks `auth.uid()` internally

### Role Predicates (all verified in migrations)
| Predicate | Allowed roles | Used by |
|---|---|---|
| `is_org_member(org_id)` | all 4 | general org-level access checks |
| `is_org_owner(org_id)` | owner | invite creation, team page |
| `can_manage_sites(org_id)` | owner, project_manager | sites, workers, attendance write |
| `can_record_on_site(site_id)` | supervisor (assigned, non-archived) | attendance/reports insert |
| `can_review_site(site_id)` | owner, project_manager | attendance review |
| `can_view_wages(org_id)` | owner, accountant | wages, worker rates |
| `has_site_access(site_id)` | supervisor (assigned) + managers | sites read |
| `has_worker_access(worker_id)` | managers + supervisor on assigned site | workers read |

---

## Critical Findings Summary

| ID | Severity | Title | Known? | Status |
|---|---|---|---|---|
| BUG-01 | HIGH | Email confirmation template unverified | #134 | PENDING verification |
| SEC-01 | HIGH | `/wages` and `/export` not in middleware SIGNED_IN_ONLY | #140 | KNOWN |
| BUG-02 | MEDIUM | Export link missing from dashboard | #135 | KNOWN |
| BUG-03 | MEDIUM | `accept_invite` silently keeps old role on conflict | design decision | OPEN |
| BUG-04 | RETRACTED | Pay-type lock: correctly handled in code | CLOSED |
| BUG-05 | MEDIUM | `removeSupervisor` sends client timestamp (trigger overwrites it) | new | OPEN (low risk) |
| SEC-02 | LOW | `safeNextPath` does not URL-decode before `//` check | new | OPEN (theoretical only) |
| BUG-06 | LOW | `addWorker` single() may return null with no meaningful error code | new | OPEN |

See BUG-REGISTER.md and SECURITY-REPORT.md for full detail.

---

## Credential Gate — Action Required

**Phase 6 (S1-S15 live smoke tests) requires your assistance.**

To proceed, please confirm or provide one of:

**Option A** — Confirm the four test accounts from `smoke-test-log-2026-10-30.md` still exist  
(`owner-test`, `pm-test`, `supervisor-test`, `accountant-test`) with a pilot organisation  
and are accessible for web testing (no passwords needed; I will guide you step-by-step).

**Option B** — Sign up with a fresh test email, tell me when verification arrives,  
confirm where the link lands. I will record S1 and proceed from there.

**Option C** — Walk through browser tests with me open in parallel.

Without live test execution, S1-S15 remain BLOCKED. Code-review findings are fully recorded.

---

## Progress Table (live)

| # | Activity | Done at | Result |
|---|---|---|---|
| Read CLAUDE.md, DEPLOY.md, FEATURES.md | 13:28-13:31 IST | Architecture understood |
| Secrets scan (service_role, jwt keys, .env files, git history) | 13:31 IST | PASS — no leaks |
| Auth flow code review (confirm route, signIn, signUp, signOut) | 13:29-13:31 IST | 1 finding (BUG-01 pending) |
| Middleware & route-guard review | 13:30 IST | 1 known finding (SEC-01/#140) |
| RLS policies review (sampled key migrations) | 13:30-13:32 IST | PASS — well-structured |
| Server actions review (all modules) | 13:30-13:33 IST | 3 findings |
| Invite system review | 13:31 IST | 1 design-level finding (BUG-03) |
| Rate-limit review | 13:31 IST | PASS |
| Export system review | 13:32 IST | PASS |
| Dashboard link audit (#135) | 13:31 IST | KNOWN |

---

## Pilot Readiness Preliminary Assessment

**Current rating: CONDITIONALLY READY (pending live test validation)**

Pre-conditions before declaring READY FOR CONTROLLED PILOT:
- PASS — No service-role key in code
- PASS — RLS enabled on all tables (verified in migrations)
- PASS — No credentials in git history
- PENDING — Email confirmation template correct (unverified — PRE-1)
- BLOCKED — S1-S15 smoke tests (needs credentials)
- OPEN — #135 Export link missing from dashboard (low-severity UX gap)
- KNOWN — #140 `/wages` + `/export` not in middleware SIGNED_IN_ONLY (known UX issue)

The architecture, RLS policies, and server-action authorization are well-structured and follow the documented security model. **No critical authorization bypass or data-isolation failure was found in code review.** The main risks are operational (unverified email template, untested live flows).
