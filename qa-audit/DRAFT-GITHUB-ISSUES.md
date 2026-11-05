# Draft GitHub Issues

**These issues are DRAFT only. Do not create until Manish explicitly approves.**

---

## Issue 1: Add Export link to owner's dashboard card

**Title:** feat(dashboard): Add Export link to owner's org card

**Labels:** bug, Identity & Access, UX, priority:medium

**Body:**

### Problem
The `/export` page exists and is functional, but there is no link to it from the dashboard. An owner must know the URL manually. This blocks S15 (owner export smoke test).

### Evidence
`lib/dashboard/links.ts` LINKS array does not include an Export entry for the owner role.

### Fix
Add to the LINKS array in `apps/web/src/lib/dashboard/links.ts`:
```ts
{ label: "Export", path: "/export", note: "Download your data", roles: ["owner"] }
```

### Acceptance criteria
- Owner's org card on `/dashboard` shows an "Export" link
- Clicking it navigates to `/export?org=<org_id>`
- Other roles (project_manager, supervisor, accountant) do not see this link
- S15 smoke test unblocked

**Responsible module:** Identity & Access — Ishant

---

## Issue 2: Add /wages and /export to middleware SIGNED_IN_ONLY

**Title:** fix(middleware): Add /wages and /export to SIGNED_IN_ONLY list

**Labels:** bug, UX, priority:low, needs-post-review

**Body:**

### Problem
`proxy.ts` SIGNED_IN_ONLY does not include `/wages` or `/export`. Signed-out users visiting these URLs are not immediately redirected by middleware; they go through a full server-render cycle before the page-level auth check redirects them.

This is known as issue #140.

### Evidence
`apps/web/src/proxy.ts` line 4:
```ts
const SIGNED_IN_ONLY = ["/dashboard", "/team", "/reports", "/workers", "/materials", "/sites", "/attendance", "/overview"];
```

### Fix
```ts
const SIGNED_IN_ONLY = ["/dashboard", "/team", "/reports", "/workers", "/materials", "/sites", "/attendance", "/overview", "/wages", "/export"];
```

### Note
This is a UX improvement only. The security boundary is RLS. The pages already perform their own auth checks.

---

## Issue 3: Pay-type lock error gives no user-readable message

**Title:** fix(workers): Show meaningful error when pay_type cannot be changed

**Labels:** bug, Workforce, UX, priority:medium

**Body:**

### Problem
The database correctly locks `pay_type` once a worker has a wage rate. When an owner or project manager tries to change it, the update fails silently with a generic error code. The user has no idea why.

### Steps to reproduce
1. Add a worker with `pay_type = daily`
2. Add a wage rate for the worker
3. Go to the worker edit page and change pay_type to `hourly`
4. Submit the form
5. Observe the error

### Expected
"Pay type cannot be changed once a wage rate has been set."

### Actual
Generic error message with no explanation.

### Fix
In `apps/web/src/lib/workers/form.ts`, add a case in `workerErrorCode()` for the pay-type-lock constraint PostgreSQL error code and return: `"Pay type cannot be changed once a wage rate has been set."`

Also add this message to `apps/web/src/lib/messages.ts` if that is where user-facing strings live.

**Responsible module:** Workforce — Ishant

---

## Issue 4: accept_invite silently keeps existing role on conflict

**Title:** feat(invites): Surface role-conflict when existing member accepts an invite for a different role

**Labels:** enhancement, Identity & Access, UX, priority:medium, needs-post-review

**Body:**

### Problem
When an existing member (e.g., a supervisor) accepts an invite for a different role (e.g., project_manager), the invite is consumed but the existing role is silently kept. The inviting owner gets no indication that the role change did not happen. This is a confusing workflow for pilot operators trying to change a team member's role.

### Current behavior (ADR-019 I1)
```sql
insert into public.memberships (org_id, user_id, role)
values (v_invite.org_id, v_uid, v_invite.role)
on conflict (org_id, user_id) do nothing;
```

### Proposed fix options

**Option A (minimal — recommended for pilot):** Return a distinct signal from `accept_invite()` when the user was already a member:
- Return `'already_member:<org_id>'` instead of just `<org_id>`
- The web page shows: "You are already a member of this organisation. Your role has not changed."

**Option B (full fix):** Update the membership role on conflict:
```sql
on conflict (org_id, user_id) do update set role = EXCLUDED.role;
```
Requires review of whether RLS `memberships_update` allows this via the DEFINER function.

### Acceptance criteria
- If a user is already a member and accepts an invite with a different role, they see a clear message
- The inviting owner can verify the role was/was not changed

**Responsible module:** Identity & Access — Ishant

---

## Issue 5: addWorker action produces empty error code on null return

**Title:** fix(workers): addWorker action falls back to empty error code when data is null without error

**Labels:** bug, Workforce, priority:low

**Body:**

### Problem
In `apps/web/src/app/(app)/workers/actions.ts` line 98:
```ts
if (error || !data) backToList(orgId, workerErrorCode(error?.code));
```
If `data` is null but `error` is also undefined (edge case), `workerErrorCode(undefined)` returns an unspecific code, producing a redirect to `/workers?org=<id>&error=` with no message shown to the user.

### Fix
```ts
if (error || !data) backToList(orgId, error ? workerErrorCode(error.code) : "worker_save_failed");
```

Ensure `"worker_save_failed"` is mapped to a human-readable message in `lib/messages.ts`: "Worker could not be saved. Please try again."

**Responsible module:** Workforce — Ishant

