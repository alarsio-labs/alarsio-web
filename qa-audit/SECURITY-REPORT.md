# Security Report

**Audit:** Alarsio QA & Security Audit  
**Date:** 2026-11-02  
**Repository:** C:\Desktop\alarsio-web (main @ 482fb2c)  
**Methodology:** Source code review, migration analysis, git history scan

---

## Overall Security Assessment

**Rating: GOOD (pending live verification)**

The application's security architecture is well-designed and correctly implemented in code. The authorization boundary is Supabase RLS, not application-level checks. All queries run as the signed-in user with the publishable key. No service-role key exists in code. Role predicates are SECURITY DEFINER with `set search_path = public` and use only `auth.uid()` (no user-controlled identity).

---

## Findings

### SEC-01 — `/wages` and `/export` not in middleware SIGNED_IN_ONLY

| Field | Value |
|---|---|
| **Severity** | LOW (middleware UX gap — not a security bypass) |
| **CVSS estimate** | N/A (informational) |
| **Status** | KNOWN #140 |

**Impact:** Signed-out users are not immediately redirected by middleware when visiting `/wages` or `/export`. The pages perform their own auth check (`supabase.auth.getUser()` + redirect). RLS is the actual boundary — no data is ever returned to an unauthenticated user. This is a UX issue, not a security issue.

**Evidence:** [`proxy.ts` line 4](file:///C:/Desktop/alarsio-web/apps/web/src/proxy.ts#L4)

**Remediation:** Add `/wages` and `/export` to `SIGNED_IN_ONLY` array.

---

### SEC-02 — safeNextPath does not URL-decode before double-slash check

| Field | Value |
|---|---|
| **Severity** | THEORETICAL — no actual bypass confirmed |
| **Status** | OPEN |

**Description:**  
`safeNextPath()` checks that the path does not start with `//`. It does NOT URL-decode the input before this check. A path like `/%2Fevil.com` would pass the prefix check (starts with `/`) and the double-slash check (second char is `%`, not `/`).

**However:** When `NextResponse.redirect(new URL(next, request.url))` is called with `/%2Fevil.com`, browsers interpret this as a path, not a host. The URL constructor normalizes `%2F` to `%2F` in the path. Modern browsers do NOT treat `/%2F` as a protocol-relative redirect. This cannot be used for an open redirect to an external domain.

**Rating:** Theoretical only. No actual open redirect possible with this input.

**Remediation (optional hardening):**  
```ts
// Decode before checking
const decoded = safeDecodeURIComponent(next);
if (decoded.startsWith("//")) return fallback;
```

---

### SEC-03 — invite token acceptance does not validate invitee email matches

| Field | Value |
|---|---|
| **Severity** | LOW (by design — ADR-019 I1) |
| **Status** | DESIGN DECISION |

**Description:**  
From ADR-019: "The link alone grants access: whoever signs in and opens it joins with the invited role. The invited email is where the link is sent, not a check."

This means if an invite link is forwarded by its recipient to someone else, that third party can join the organisation. This is intentional for the MVP (the invite token is the credential), but should be noted for pilot awareness.

**Remediation:** For a post-MVP hardening option, validate that the signed-in user's email matches the invite's email before accepting.

---

### SEC-04 — Rate limit counter is per-user, not per-IP

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Status** | DESIGN DECISION |

**Description:**  
`enforce_rate_limit()` uses `(user_id, key)` as the counter key. An attacker who registers many accounts can bypass per-user rate limits. For `accept_invite` (10/hr per user), a determined attacker with 100 accounts could make 1,000 token-guessing attempts per hour.

**However:** Invite tokens are 244 bits of entropy (two UUID4s concatenated, hex-encoded). Brute-forcing a 244-bit space is computationally infeasible. The rate limit is a usability control, not a security boundary.

**Remediation:** No action needed for pilot. Post-pilot: add Vercel's built-in rate limiting at the edge for `/invite/[token]` if token enumeration becomes a concern.

---

### SEC-05 — Report photos storage bucket: cannot verify without dashboard access

| Field | Value |
|---|---|
| **Severity** | HIGH if misconfigured |
| **Status** | BLOCKED — needs dashboard verification |

**Description:**  
DEPLOY.md section 1 requires the `report-photos` bucket to be **private**, 10 MB max, JPEG/PNG/WebP only. The migration `20261016220000_report_photos_storage.sql` creates the bucket with these settings. Cannot verify the live bucket configuration without Supabase dashboard access.

**If misconfigured (bucket is public):** Any person with a storage path (obtainable from the owner export or from a compromised account) could directly download any report photo without authentication.

**Remediation:** Verify in Supabase dashboard → Storage → report-photos:
- Access: Private
- File size limit: 10 MB
- Allowed MIME types: image/jpeg, image/png, image/webp

---

### SEC-06 — Audit log stores complete rows including potential PII

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Status** | DESIGN DECISION (ADR-008) |

**Description:**  
`write_audit()` stores old_data and new_data as complete JSONB rows. This means worker names, phone numbers, and other PII are in the audit log. The export correctly redacts `token_hash` from `invites` audit records, but does not redact worker PII from the audit log.

**Mitigating factors:**
- Audit log is only readable by the owner (`audit_log_select` RLS policy)
- The export notes: "Audit log readable by the owner only"
- DPDP compliance: the owner is the data controller and can access their own org's audit log

**Recommendation:** Ensure the data retention policy (purge_log) enforces the 3-year floor per ADR-017.

---

### SEC-07 — No CSRF protection on server actions

| Field | Value |
|---|---|
| **Severity** | LOW (Next.js mitigated) |
| **Status** | INFORMATIONAL |

**Description:**  
Next.js App Router Server Actions are protected against CSRF by default: they require a `Content-Type: application/x-www-form-urlencoded` or `multipart/form-data` request from the same origin. Cross-origin form submissions are blocked by the Same-Origin Policy and Next.js's built-in CSRF token on server actions.

**Conclusion:** CSRF is mitigated by the framework.

---

### SEC-08 — No security headers verified

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Status** | BLOCKED — needs live HTTP inspection |

**Description:**  
Cannot verify security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS) without making live HTTP requests to https://alarsio-web.vercel.app.

Vercel adds some security headers by default (X-Content-Type-Options, X-Frame-Options). A custom `next.config.js` may add more.

**Recommended headers to verify:**
```
Content-Security-Policy: default-src 'self'; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=()
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

**Remediation:** Run `curl -I https://alarsio-web.vercel.app` and check response headers.

---

### SEC-09 — No input validation for numeric range on client side

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Status** | ACCEPTED (server-side enforcement) |

**Description:**  
The wage adjustment form accepts amount input from the client, but range validation (max 10 lakh) is enforced server-side in `cleanAdjustmentInput()` and at the DB check constraint. Client-side validation would improve UX but is not a security concern.

---

## Positive Security Findings

The following security controls were verified to be correctly implemented:

1. **No service-role key anywhere** — confirmed via grep and code review
2. **All tables have RLS enabled** — confirmed in migrations; `schema_guards_test.sql` enforces this in CI
3. **All functions are SECURITY DEFINER with set search_path** — prevents schema injection
4. **Invite tokens: only hash stored, raw token returned once** — 244-bit entropy, sha256 hash
5. **Rate limiting on all write-heavy operations** — DB-side with PT429 error code
6. **Cross-org isolation via composite foreign keys** — workers and sites cannot cross org boundaries at DB level
7. **No DELETE grants on any table** — immutable history enforced at DB level
8. **Supervisor cannot read wage amounts** — `can_view_wages` predicate, verified in RLS
9. **Approved attendance days are locked** — `attendance_day_lock` migration, `PS409` on late write
10. **Self-review guard on attendance and reports** — `attendance_self_review_guard` migration
11. **Open redirect protection** — `safeNextPath()` with multiple checks
12. **Email enumeration prevention** — `user_already_exists` treated as success in signUp
13. **Token enumeration prevention** — `accept_invite` returns null (not an error) for all failure cases
14. **Anon role has no grants** — all tables revoke from anon and public first

---

## Pending Live Verification

These items require live access to complete:

| Item | Requirement |
|---|---|
| Supabase Auth Site URL | Must be https://alarsio-web.vercel.app |
| Redirect URLs | Must include /auth/confirm and /invite/** |
| Email confirmation ON | Must be enabled |
| Email template | Must match documented format |
| report-photos bucket | Must be private |
| Security response headers | Must be inspected via HTTP |
| RLS isolation between two orgs | Must be tested with two separate accounts |

