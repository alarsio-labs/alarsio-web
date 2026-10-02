# Security review checklist

Run `/security-review` in Claude Code first. Then walk this list yourself — the
automated pass finds the obvious, this finds the rest.

**Mandatory on any PR touching:** auth, RLS, roles, worker data, wages, file
upload, or anything a supervisor can reach.

## Always

- [ ] **RLS is enabled** on every new table *and* every new view. No exceptions.
- [ ] A new policy calls a **named predicate** (`is_org_member`, `has_site_access`)
      rather than comparing a role inline.
- [ ] **No service-role key** anywhere in application code, env files, or CI logs.
- [ ] No secret, token, key or real credential in the diff. Check `.env.example`
      only has placeholders.
- [ ] Nothing was logged that contains a worker's name, phone, or location.

## Data access

- [ ] A `supervisor` can reach **only** sites assigned to them — tested, not assumed.
- [ ] A `supervisor` cannot read wage amounts.
- [ ] Only an `owner` can reopen a locked wage period.
- [ ] A view is `security_invoker`, so it never shows more than its tables allow.
- [ ] The query cannot be made to return another organisation's rows by changing
      an id in the request.

## Input

- [ ] Every user input is validated **server-side**, not only in the form.
- [ ] No string concatenation into SQL. Parameters only.
- [ ] File uploads check type and size; a filename cannot escape its folder.
- [ ] Numeric input that becomes money or hours is range-checked.

## Worker data — DPDP

- [ ] Consent is recorded before worker PII is entered.
- [ ] Deleting a user or worker **removes access, never history**.
- [ ] Location is captured once, on an explicit tap, never in the background.
- [ ] Data that leaves the system (exports) carries only what the role may see.

## Offline and sync

- [ ] A replayed push creates no duplicate row.
- [ ] A device cannot overwrite a record a manager has already approved.
- [ ] The device id in a request is not trusted as an identity.

## Before approving

Ask yourself: **if this PR were malicious, what could it do?** If the answer is
"nothing much", approve. If you cannot tell, say so and ask.
