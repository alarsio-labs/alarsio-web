# Alarsio smoke-test log — 2026-10-30

Live manual test of https://alarsio-web.vercel.app (Vercel, main @ 482fb2c, CI green).
Backend: team Supabase project. Tester: Manish (manishtiwari2). Times in IST (Asia/Kolkata).

Rules for this log: no passwords, keys, tokens, invite tokens or full email addresses.
Test accounts are named `owner-test`, `pm-test`, `supervisor-test`, `accountant-test`.

## Scope

- Web smoke tests S1–S15 from `docs/DEPLOY.md` §6, in the order:
  Pre-check → S1 → S2 → S3 → S4 → S5 → S9 (web half only) → S11 → S12 → S14 → S15.
- S6, S7, S8, S10, S13: **Blocked — no APK** (issue #130).
- Afterwards: full page walk-through per role at desktop width and 375px.

## Known issues — NOT to be re-logged as new

- #140 — `/wages` without an org redirects with `next=/dashboard`; `/wages` and `/export` missing from SIGNED_IN_ONLY.
- #135 — no Export link on the dashboard.
- #138 — `/attendance/[id]` table layout at 375px.
- #134 — signup email template must link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard` (unconfirmed; first suspect if S1 fails at the email link).

## Pre-checks already done (before this log, signed out)

| Check | Result |
| :-- | :-- |
| `/`, `/sign-in`, `/sign-up` load | PASS (seen) |
| `/dashboard`, `/export` redirect to sign-in with `next=` | PASS (seen) |
| `/auth/confirm` with no token → link_invalid | PASS (seen) |
| Bad `/invite/<token>` → "Invite link not valid" | PASS (seen) |

---

## Step 1 — Supabase Auth settings pre-check

- **ID:** PRE-1
- **Date/time:** 2026-10-30 08:3x IST
- **Account/role:** n/a (dashboard inspection, no keys read out)
- **Steps:** In Supabase dashboard → Authentication: read Site URL, Redirect URLs, and
  Sign In / Up → Email Templates → "Confirm signup" template. No secrets pasted.
- **Expected:**
  - Site URL = `https://alarsio-web.vercel.app` (not localhost).
  - Redirect URLs include `https://alarsio-web.vercel.app/auth/confirm` and `https://alarsio-web.vercel.app/invite/**`.
  - Email confirmations ON.
  - Confirm signup template links to
    `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`.
- **Actual:** _awaiting read-out_
- **Result:** PENDING
- **URL:** Supabase dashboard → Authentication

---

## Test results

_(S1–S15 entries are appended below as each test runs.)_

---

## Summary table (filled at the end)

| # | Flow | Result | Notes |
| :-- | :-- | :-- | :-- |
| S1 | Sign up and verify | — | |
| S2 | Organisation | — | |
| S3 | Invite | — | |
| S4 | Sites and assignment | — | |
| S5 | Worker import | — | |
| S6 | Phone sign-in | BLOCKED | no APK (#130) |
| S7 | Check in/out | BLOCKED | no APK (#130) |
| S8 | Day register | BLOCKED | no APK (#130) |
| S9 | Approval | — | web half only |
| S10 | Daily report | BLOCKED | no APK (#130) |
| S11 | Report review | — | |
| S12 | Wage summary | — | |
| S13 | Offline sync | BLOCKED | no APK (#130) |
| S14 | Roles refused | — | |
| S15 | Owner export | — | |

## Draft GitHub issues (created only after approval)

_(none yet)_
