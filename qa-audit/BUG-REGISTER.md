# Bug Register

**Audit:** Alarsio QA & Security Audit  
**Date started:** 2026-11-02  
**Repository:** C:\Desktop\alarsio-web (main @ 482fb2c)

---

## Severity Scale
- CRITICAL — Authorization bypass, data loss, security exploit possible
- HIGH — Core workflow broken, significant security gap, S-test blocker
- MEDIUM — Feature degraded, meaningful UX impact, non-critical security concern
- LOW — Minor UX, cosmetic, theoretical risk

---

## BUG-01 — Email confirmation template not verified (S1 blocker)

| Field | Value |
|---|---|
| **ID** | BUG-01 |
| **Severity** | HIGH |
| **Status** | OPEN — PENDING verification |
| **Affected feature** | Sign up & email verification (S1) |
| **Affected roles** | All (new users) |
| **Related issue** | #134 |

### Description
The Supabase Auth "Confirm signup" email template has not been verified to contain the correct URL. If incorrect, every new sign-up will receive a broken verification link and S1 fails.

### Expected template
```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
```

### Reproduction steps
1. Sign up with a new email address on https://alarsio-web.vercel.app/sign-up
2. Open the verification email
3. Click the verification link
4. Observe where it lands

### Expected result
Link lands on `/auth/confirm?token_hash=<hash>&type=email&next=/dashboard`, which redirects to `/dashboard`.

### Actual result
Unknown — not yet tested (smoke-test-log-2026-10-30.md PRE-1 shows PENDING).

### Root cause
Supabase dashboard Auth > Email Templates > "Confirm signup" may still use the default template, which does not match the `route.ts` implementation.

### Evidence
- `smoke-test-log-2026-10-30.md` PRE-1: PENDING
- `app/auth/confirm/route.ts` line 10: comment documents expected template
- `DEPLOY.md` section 1 (Auth settings): checkbox for this is unticked

### Likely cause file
Supabase dashboard configuration (not in code). If the template is wrong, fix it in: Supabase dashboard → Authentication → Email Templates → Confirm signup.

### Suggested fix
In Supabase dashboard, set the Confirm signup template body to include:
```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
```

---

## BUG-02 — Export link missing from dashboard (owner cannot find Export)

| Field | Value |
|---|---|
| **ID** | BUG-02 |
| **Severity** | MEDIUM |
| **Status** | OPEN (KNOWN #135) |
| **Affected feature** | Owner data export (S15) |
| **Affected roles** | owner |

### Description
The dashboard's organisation card shows links based on role. The owner's Export page (`/export?org=<id>`) is not included in `orgLinks()`, so there is no way to navigate to it from the dashboard. S15 requires this.

### Reproduction steps
1. Sign in as owner
2. Open `/dashboard`
3. Look for Export link on the org card

### Expected result
An "Export" link visible on the owner's card, similar to "Team — Invite and manage".

### Actual result
No Export link. User must know to navigate to `/export?org=<id>` manually.

### Root cause
`lib/dashboard/links.ts` LINKS array does not include Export.

### Verified file and line
[`lib/dashboard/links.ts` line 9-18](file:///C:/Desktop/alarsio-web/apps/web/src/lib/dashboard/links.ts#L9-L18)

```ts
const LINKS: (OrgLink & { roles: AppRole[] })[] = [
  { label: "Overview", ...roles: ["owner", "project_manager"] },
  { label: "Daily reports", ...roles: ["owner", "project_manager", "supervisor"] },
  { label: "Attendance", ...roles: ["owner", "project_manager"] },
  { label: "Sites", ...roles: ["owner", "project_manager"] },
  { label: "Materials", ...roles: ["owner", "project_manager"] },
  { label: "Workers", ...roles: ["owner", "project_manager", "accountant"] },
  { label: "Wages", ...roles: ["owner", "accountant"] },
  { label: "Team", ...roles: ["owner"] }
  // MISSING: Export for owner
];
```

### Suggested fix
Add to LINKS array:
```ts
{ label: "Export", path: "/export", note: "Download your data", roles: ["owner"] }
```
Responsible module: Identity & Access (dashboard links). Owner: Ishant.

---

## BUG-03 — accept_invite silently ignores role change for existing member

| Field | Value |
|---|---|
| **ID** | BUG-03 |
| **Severity** | MEDIUM (design gap) |
| **Status** | OPEN — design decision in ADR-019, pilot review needed |
| **Affected feature** | Invite acceptance (S3) |
| **Affected roles** | owner (creating invite), invited user |

### Description
If a user is already a member of an organisation (e.g., as `supervisor`) and accepts an invite for a different role (e.g., `project_manager`), the invite is consumed and marked accepted, but the existing role is silently preserved. The inviting owner receives no indication that the role change did not occur.

This is documented behavior in the migration comment: "Already a member: keep the existing role, still use up the invite." However, for a construction owner who is trying to promote a supervisor to project manager via an invite link, this creates a confusing and invisible failure.

### Reproduction steps
1. Sign in as owner, send invite for `project_manager` to an email that belongs to an existing `supervisor`
2. Accept the invite as the supervisor
3. Observe role on the dashboard

### Expected result (user expectation)
Role is updated to `project_manager`.

### Actual result
Role remains `supervisor`. Invite is consumed. No error or notification.

### Root cause
`accept_invite()` in `20261018110000_identity_invites.sql` line 140-142:
```sql
insert into public.memberships (org_id, user_id, role)
values (v_invite.org_id, v_uid, v_invite.role)
on conflict (org_id, user_id) do nothing;
```
`DO NOTHING` silently discards the new role.

### Suggested fix (for pilot consideration)
Option A (minimal): Return a distinct signal when the member already existed (e.g., return the org_id with a second column `already_member: bool`), so the web can show a message.
Option B (recommended): Allow the role to be updated via the invite. Change `DO NOTHING` to `DO UPDATE SET role = EXCLUDED.role`. Requires review of the membership_update RLS policy.
Option C: Validate in `create_invite()` that the invitee is not already a member (currently only checks by email, not by user_id). Surface a meaningful error to the inviting owner.

---

## BUG-04 — Pay-type lock error: RETRACTED (correctly handled)

| Field | Value |
|---|---|
| **ID** | BUG-04 |
| **Severity** | RETRACTED |
| **Status** | CLOSED — not a bug |

### Resolution
Code review of `lib/workers/form.ts` confirms that `workerErrorCode("55000")` maps to `"pay_type_locked"`, and `lib/messages.ts` maps this to: *"This worker already has a wage rate, so the pay type cannot change. Add them under a new code to change it."*

The error handling is correct. This finding was incorrect based on incomplete code review. No action needed.

---

## BUG-05 — removeSupervisor sends client-generated timestamp (trigger overwrites)

| Field | Value |
|---|---|
| **ID** | BUG-05 |
| **Severity** | LOW-MEDIUM (safe due to trigger, fragile pattern) |
| **Status** | OPEN |
| **Affected feature** | Site supervisor assignment |
| **Affected roles** | owner, project_manager |

### Description
The `removeSupervisor` action sets `unassigned_at` to a client-generated ISO timestamp (`new Date().toISOString()`). The database trigger `wsa_stamp_unassign` overwrites this with `now()` server-side. The current behavior is safe, but the pattern is fragile: if the trigger is ever removed or disabled, the client could set any timestamp.

### Root cause
[`sites/actions.ts` line 149](file:///C:/Desktop/alarsio-web/apps/web/src/app/(app)/sites/actions.ts#L149):
```ts
.update({ unassigned_at: new Date().toISOString() })
```
The trigger in migration `20261016110000_workforce_tables.sql` (line 128-133):
```sql
if old.unassigned_at is null and new.unassigned_at is not null then
  new.unassigned_at := now();
  new.unassigned_by := auth.uid();
end if;
```

### Suggested fix
Set `unassigned_at` to any non-null value (e.g., the string `"now"` or a sentinel value) since the trigger will overwrite it regardless. Document this pattern clearly to prevent future confusion.

---

## BUG-06 — addWorker action: workerErrorCode(undefined) returns "generic" (minor)

| Field | Value |
|---|---|
| **ID** | BUG-06 |
| **Severity** | LOW (UX only) |
| **Status** | OPEN |
| **Affected feature** | Add worker form |
| **Affected roles** | owner, project_manager |

### Description
In `workers/actions.ts` line 98:
```ts
if (error || !data) backToList(orgId, workerErrorCode(error?.code));
```
If `data` is null but `error` is also undefined/null (edge case: insert succeeded but `.select("id").single()` returned no rows due to RLS race on STABLE function), `workerErrorCode(undefined)` returns `"generic"`, which maps to `"Something went wrong. Try again."` — **this is acceptable but not ideal**. The user does not know if the worker was actually saved or not.

Note: `workerErrorCode(undefined)` does correctly return `"generic"` (not an empty string — initial finding was incorrect). The UX issue is that the user gets a confusing "something went wrong" after what was actually a successful DB insert.

### Root cause
[`workers/actions.ts` line 97-98](file:///C:/Desktop/alarsio-web/apps/web/src/app/(app)/workers/actions.ts#L97-L98)

### Suggested fix (optional)
Treat null data with no error as a distinct case:
```ts
if (error || !data) backToList(orgId, error ? workerErrorCode(error.code) : "worker_save_check");
```
Add `worker_save_check` to messages: "Worker may have been saved. Refresh the worker list to check."

This is very low priority — the race condition is extremely unlikely in practice.

---

## BUG-07 — Attendance table layout at 375px (KNOWN #138)

| Field | Value |
|---|---|
| **ID** | BUG-07 |
| **Severity** | MEDIUM |
| **Status** | OPEN (KNOWN #138) |
| **Affected feature** | Attendance day detail `/attendance/[id]` |
| **Affected roles** | owner, project_manager (reviewers) |

### Description
The attendance entry table in `/attendance/[id]` does not render correctly at 375px viewport width (iPhone SE). Rows overflow horizontally.

### Root cause
Table layout without `min-width` constraints; columns are too wide for 375px.

### Suggested fix
Add `overflow-x-auto` wrapper around the table, or use responsive column hiding.

---

## BUG-08 — No Export link on dashboard navigation (duplicate of BUG-02, tracked as #135)

Omitted — see BUG-02.

---

## BUG-09 — Wages and export pages not in middleware SIGNED_IN_ONLY (KNOWN #140)

| Field | Value |
|---|---|
| **ID** | BUG-09 |
| **Severity** | LOW (UX only — security boundary unaffected) |
| **Status** | OPEN (KNOWN #140) |
| **Affected feature** | Session redirect for /wages and /export |
| **Affected roles** | All |

### Description
Signed-out users navigating to `/wages?org=<id>` or `/export?org=<id>` do not get immediately redirected by middleware. The page renders briefly (server-side) and then redirects from within the page component. This causes a minor flash and less clean Vercel logs.

### Root cause
[`proxy.ts` line 4](file:///C:/Desktop/alarsio-web/apps/web/src/proxy.ts#L4):
```ts
const SIGNED_IN_ONLY = ["/dashboard", "/team", "/reports", "/workers", "/materials", "/sites", "/attendance", "/overview"];
// Missing: "/wages", "/export"
```

### Suggested fix
Add `"/wages"` and `"/export"` to the `SIGNED_IN_ONLY` array.

---

## Open Issues Summary

| ID | Severity | Title | Status |
|---|---|---|---|
| BUG-01 | HIGH | Email template unverified | PENDING dashboard verification |
| BUG-02 | MEDIUM | Export link missing from dashboard | KNOWN #135 |
| BUG-03 | MEDIUM | accept_invite silently keeps old role | Design review needed |
| BUG-04 | RETRACTED | Pay-type lock error — correctly handled | CLOSED |
| BUG-05 | LOW-MED | removeSupervisor sends client timestamp (trigger overwrites) | OPEN (safe) |
| BUG-06 | LOW | addWorker generic error on null-without-error edge case | OPEN |
| BUG-07 | MEDIUM | Attendance table 375px layout | KNOWN #138 |
| BUG-09 | LOW | wages/export not in middleware SIGNED_IN_ONLY | KNOWN #140 |
