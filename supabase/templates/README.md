# Supabase Auth email templates

Supabase sends these emails itself, so the HTML lives in the dashboard. Do not edit these
files by hand; they are generated from `apps/web/src/lib/email/auth-templates.ts`, which
uses the same layout as the app's own emails.

Regenerate after changing the source:

```bash
cd apps/web && WRITE_AUTH_TEMPLATES=1 npx vitest run src/lib/email/layout.test.ts
```

The normal test run fails if a file drifts from the source.

## Put them live (Supabase dashboard, about 3 minutes)

Authentication, Emails, **Templates**:

| Dashboard template | Subject | Body (paste the whole file) |
|---|---|---|
| Confirm sign up | `Confirm your email for Alarsio` | `confirm-signup.html` |
| Invite user | `You're invited to Alarsio` | `invite-user.html` |
| Magic link or OTP | `Your Alarsio sign-in link` | `magic-link.html` |
| Change email address | `Confirm your new email for Alarsio` | `change-email.html` |
| Reset password | `Set a new Alarsio password` | `reset-password.html` |
| Reauthentication | `Your Alarsio verification code` | `reauthentication.html` |

Save each one. Every link goes through `/auth/confirm` with `token_hash`, as `docs/DEPLOY.md` requires.
Reauthentication has no link, only the code. Team invites from the app's Team page are sent by
the web app itself (`apps/web/src/lib/email/invite-email.ts`), not by the Invite user template.
