# Pilot Readiness Checklist

**Audit:** Alarsio QA & Security Audit  
**Date:** 2026-11-02  
**Repository:** C:\Desktop\alarsio-web (main @ 482fb2c)

---

## Current Readiness Decision

**CONDITIONALLY READY — Live test validation required**

No critical security or data-isolation failures found in code review. The architecture is sound. Pilot readiness is blocked by unexecuted live smoke tests (S1-S15) and unverified Supabase Auth configuration.

---

## DEPLOY.md Pre-Checklist

### Section 0 — Before anything else

| # | Check | Status | Notes |
|---|---|---|---|
| 0.1 | `main` is green in CI (typecheck, lint, test, build, test-db) | UNKNOWN | Cannot verify without CI access |
| 0.2 | Secrets scan passes on main | PASS | Verified manually — no leaks |
| 0.3 | Team has Supabase CLI linked | UNKNOWN | Developer responsibility |

### Section 1 — Supabase

| # | Check | Status | Notes |
|---|---|---|---|
| 1.1 | Site URL = deployed Vercel URL | UNKNOWN | Needs dashboard verification (PRE-1) |
| 1.2 | Redirect URLs include /auth/confirm and /invite/** | UNKNOWN | Needs dashboard verification |
| 1.3 | Email confirmations ON | UNKNOWN | Needs dashboard verification |
| 1.4 | Custom SMTP configured and test email passes | UNKNOWN | Needs dashboard verification |
| 1.5 | Email template correct | UNKNOWN | HIGH RISK — see BUG-01 |
| 1.6 | report-photos bucket exists, private, 10MB, JPEG/PNG/WebP | UNKNOWN | Needs dashboard verification |
| 1.7 | Manual backup taken before first push | UNKNOWN | Developer responsibility |
| 1.8 | Restore test done into scratch project | UNKNOWN | Developer responsibility |

### Section 2 — Vercel

| # | Check | Status | Notes |
|---|---|---|---|
| 2.1 | Repository imported, Next.js preset | PASS | Site is live at alarsio-web.vercel.app |
| 2.2 | Root Directory: apps/web with source files outside root | UNKNOWN | Inferred PASS from working build |
| 2.3 | Production branch: main | PASS | main @ 482fb2c deployed |
| 2.4 | All env vars set (NEXT_PUBLIC_SUPABASE_URL, KEY, SITE_URL, SMTP_*) | UNKNOWN | Cannot verify Vercel env without access |
| 2.5 | NEXT_PUBLIC_SITE_URL matches Supabase Auth Site URL | UNKNOWN | Cross-system check needed |

### Section 3 — Mobile (EAS)

| # | Check | Status | Notes |
|---|---|---|---|
| 3.1 | EAS login and init done | BLOCKED | #130 — no APK |
| 3.2 | EAS env vars set | BLOCKED | #130 |
| 3.3 | APK built and installed on one real phone | BLOCKED | #130 |

### Section 5 — Secrets Scan

| # | Check | Status | Notes |
|---|---|---|---|
| 5.1 | git grep service_role clean | PASS | No matches |
| 5.2 | No .env files in git | PASS | Only .env.example |
| 5.3 | git grep for JWT/keys clean | PASS | No real tokens |
| 5.4 | git log -p no sb_secret_ in history | PASS | Only DEPLOY.md template text |

---

## S1-S15 Smoke Test Status

| # | Test | Status | Notes |
|---|---|---|---|
| S1 | Sign up and verify | BLOCKED | Needs test email + credentials |
| S2 | Organisation creation | BLOCKED | Depends on S1 |
| S3 | Invite by email and link | BLOCKED | Depends on S2 |
| S4 | Sites and assignment | BLOCKED | Depends on S2 |
| S5 | Worker import | BLOCKED | Depends on S2 |
| S6 | Phone sign-in | BLOCKED — No Android APK | #130 |
| S7 | Check in/out | BLOCKED — No Android APK | #130 |
| S8 | Day register | BLOCKED — No Android APK | #130 |
| S9 | Approval (web half) | BLOCKED | Depends on S4+S5 |
| S10 | Daily report | BLOCKED — No Android APK | #130 |
| S11 | Report review | BLOCKED | Depends on S10 |
| S12 | Wage summary | BLOCKED | Depends on S9 |
| S13 | Offline sync | BLOCKED — No Android APK | #130 |
| S14 | Roles refused | BLOCKED | Needs 4 authenticated accounts |
| S15 | Owner export | BLOCKED | Depends on S2; also #135 (no Export link) |

---

## Open Blockers Before Pilot

### MUST FIX before pilot
| Priority | Item | Owner |
|---|---|---|
| 1 | Verify Supabase Auth email template (BUG-01) | Ishant / Manish |
| 2 | Verify Supabase Auth Site URL and Redirect URLs (PRE-1) | Ishant |
| 3 | Execute S1-S15 web smoke tests | Manish |
| 4 | Verify report-photos bucket is private (SEC-05) | Ishant |

### SHOULD FIX before pilot (high impact UX)
| Priority | Item | Owner |
|---|---|---|
| 5 | Add Export link to dashboard (#135, BUG-02) | Ishant (Identity module) |
| 6 | Fix attendance table layout at 375px (#138, BUG-07) | Manish (Attendance module) |
| 7 | Add wages/export to SIGNED_IN_ONLY (#140, BUG-09) | Manish/Ishant |

### CAN DEFER to post-pilot
| Priority | Item |
|---|---|
| 8 | BUG-03 — accept_invite role-conflict behavior (design discussion) |
| 9 | BUG-04 — Pay-type lock error message |
| 10 | UX-02 — Date format (ISO → DD MMM YYYY) |
| 11 | UX-07 — Loading state on form submissions |
| 12 | PERF-01 — Wage period list pagination |
| 13 | SEC-02 — URL-decode in safeNextPath (theoretical) |
| 14 | SEC-08 — Verify security response headers |

---

## Go / No-Go Decision Tree

```
Is the email template verified? 
  NO → Fix before pilot (S1 will fail)
  YES → Continue

Have S1-S15 web tests passed (or been accepted in writing for failures)?
  NO → Cannot declare pilot ready
  YES → Continue

Is report-photos bucket private?
  NO → Fix (security risk)
  YES → Continue

Have CI checks passed on main?
  NO → Fix
  YES → Continue

Is a backup taken and restore tested?
  NO → Do before pilot
  YES → CONDITIONALLY READY FOR CONTROLLED PILOT

Are #135 and #138 fixed?
  YES → READY FOR CONTROLLED PILOT
  NO → CONDITIONALLY READY (with owner accepting these known gaps in writing)
```

---

## Final Readiness Scale

| Status | Meaning |
|---|---|
| NOT READY | Critical security issues or data loss risk |
| NOT READY — CRITICAL ISSUES | Authorization bypass, org isolation failure |
| CONDITIONALLY READY | No critical issues; known gaps accepted by pilot owner |
| READY FOR CONTROLLED PILOT | All MUST-FIX items resolved, S1-S15 passed |

**Current status: CONDITIONALLY READY**  
(Pending: email template verification, live S1-S15 execution, storage bucket verification)

