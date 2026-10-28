# Deploying the MVP

The pilot runs on **one** Supabase project (the team project from #58, which is also production),
**Vercel** for `apps/web`, and an **EAS-built internal Android APK** for `apps/mobile`. There is no
separate production project for the pilot. That means every migration push and every smoke test below
touches real data: use a pilot organisation, never a customer's, until the checklist is done.

This file is a checklist, not a record of what was done. Tick a step in the issue or PR that does it.
Nothing here needs the service-role key, and none of it belongs in git (CLAUDE.md rule 7).

## 0. Before anything else

- [ ] `main` is green in CI (typecheck, lint, test, build, `test-db`).
- [ ] The secrets scan below passes on `main`.
- [ ] Everyone who will push to the project has the Supabase CLI logged in (`supabase login`) and the
      project linked (`supabase link --project-ref <ref>`). The ref comes from the dashboard URL.

## 1. Supabase project (the team project, #58)

### Database: `db push`

1. Check the order is clean. Versions are the 14-digit prefix and must be unique:
   ```bash
   pnpm test:db
   ```
   It applies every migration in order to a throwaway Postgres and fails on a duplicate version.
   It needs Docker.
2. See what would be applied, and read the list:
   ```bash
   supabase db push --dry-run
   ```
3. Apply it. Only after the dry run lists exactly the migrations you expect, and on a day nobody is
   mid-entry on the pilot:
   ```bash
   supabase db push
   ```
4. Re-run the dry run: it must say the remote is up to date.

Migrations are append-only. Never edit a merged one; a mistake gets a new migration (CLAUDE.md).

### Rollback

There is no automatic down-migration. Pick by what went wrong:

| Situation | What to do |
| :-- | :-- |
| A migration failed part-way | Each file runs in one transaction, so the failed file left nothing. Fix forward with a new migration, then push again. |
| A migration applied but is wrong | Write a **new** migration that corrects it. Do not edit or delete the applied file, and do not `migration repair` it away. |
| Data was damaged | Restore the project from a backup (Backups below) into a new project, then repoint the apps. Tell the pilot users first: anything saved since the backup is lost. |
| A deploy of the apps is wrong | Roll the app back, not the database: Vercel "Promote to production" on the last good deployment; reinstall the last good APK. The database stays ahead of the apps, which is safe because migrations only add. |

Take a backup before any push that changes a table with data in it.

### Auth settings (dashboard, Authentication)

- [ ] **Site URL**: the deployed web address from section 2 (for example `https://<project>.vercel.app`,
      or the custom domain). Not `localhost`.
- [ ] **Redirect URLs**: add `https://<web-address>/auth/confirm` and `https://<web-address>/invite/**`
      (the verification link lands on `/auth/confirm`, invites on `/invite/<token>`). Add the preview
      domain pattern only if previews must sign in; leave it out otherwise.
- [ ] **Email confirmations on.** A user signs in only after the verification link (FEATURES: sign in).
- [ ] **Custom SMTP**: the organisation's own mailbox, the same one the web app uses for invite emails, so
      verification and invites come from one address. Host, port, user, password and sender go in the
      dashboard only. Send a test email from the dashboard and check it arrives and is not in spam.
- [ ] Email provider sign-in only. Phone OTP stays off (ADR-004). Leave sign-ups on: a new owner signs up, verifies, then creates the
      organisation through `create_organization`.
- [ ] Password rules at least the app's (8 characters).

### Storage

- [ ] The `report-photos` bucket exists after the push, is **private**, 10 MB, JPEG/PNG/WebP only
      (migration `20261016220000`). Check it in the dashboard; do not make it public.

### Backups

- [ ] Know which plan the project is on. Daily backups and point-in-time recovery are plan features:
      write down what the plan gives (retention, whether PITR is on) in #58.
- [ ] Take a manual backup (dashboard, Database, Backups) before the first real push and before each later one
      that changes tables.
- [ ] Do one **restore test** into a scratch project before the pilot starts. An untested backup is a hope.
- [ ] Owner export (ADR-026) is the user's own copy of their data; it is not a backup of the project.

## 2. Web: Vercel (`apps/web`)

1. Import the GitHub repository in Vercel. Framework preset: Next.js.
2. **Root Directory**: `apps/web`. Turn on "Include source files outside of the Root Directory"
   so the workspace packages (`@alarsio/types`, config) are available.
3. Install command `pnpm install --frozen-lockfile`; build command `pnpm build` (Turborepo runs it);
   Node 20 or newer. The pnpm version comes from `packageManager` in the root `package.json`.
4. Production branch `main`. Pull requests get preview deployments; give previews the same variables as
   production but still pointing at the one Supabase project, so do not run destructive tests on a preview.
5. Set the variables in the env table below, then deploy.
6. Put the deployed address into Supabase Auth's Site URL and Redirect URLs (section 1) **and** into
   `NEXT_PUBLIC_SITE_URL`. They must agree or invite and verification links point at the wrong place.
7. Check: `/sign-in` loads over HTTPS, and a verification email's link lands on `/auth/confirm`.

## 3. Mobile: EAS internal Android build (`apps/mobile`)

In the repo (#130): `android.package` is `in.alarsio.app` in `apps/mobile/app.json`. It cannot change
after the app is installed on phones. `apps/mobile/eas.json` has one internal profile, `pilot`, that builds
an installable APK and reads its variables from the EAS `preview` environment. No value is in the file.

Done once, by hand, with a team Expo account:

- [ ] `eas login`, then `eas init` in `apps/mobile`. It adds the project id to `app.json`; commit that change.
- [ ] Set the two public variables in the EAS `preview` environment, never in a file:
      ```bash
      eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value <url> --visibility plaintext
      eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <key> --visibility plaintext
      ```

Then:

```bash
cd apps/mobile
eas build --profile pilot --platform android
```

- [ ] Install the APK on one real phone from the build's link. Allow installs from the browser when asked.
- [ ] `EXPO_PUBLIC_*` values are compiled into the app and readable by anyone who has the APK. They must be
      the **publishable** key only; never the service-role key (rule 2).
- [ ] A new build is needed for every change to those variables or to the native plugins (location, camera).
- [ ] The Play Store, iOS and over-the-air updates are out of scope for the pilot.

## 4. Environment variables (names only)

| Name | Where it is set | Public? | Used by |
| :-- | :-- | :-- | :-- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | yes (sent to browsers) | web |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | yes | web |
| `NEXT_PUBLIC_SITE_URL` | Vercel | yes | web: invite and verification links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` | Vercel | **no** (server only) | web: invite emails |
| `SMTP_PASSWORD` | Vercel (sensitive) | **no** | web: invite emails |
| `EMAIL_FROM` | Vercel | **no** | web: invite emails |
| `EXPO_PUBLIC_SUPABASE_URL` | EAS environment | yes (inside the APK) | mobile |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | EAS environment | yes (inside the APK) | mobile |
| SMTP settings for Auth emails | Supabase dashboard | no | Supabase Auth, not the app |

`.env.example` lists the same names with placeholders. There is no service-role variable anywhere, and there
must not be one. If the SMTP variables are empty the web app still works: the owner copies the invite link.

## 5. Secrets scan

Run before the first deploy and before each release. Each command should print nothing.

```bash
git grep -n "service_role" -- apps packages supabase
git ls-files | grep -E "(^|/)\.env($|\.)" | grep -v "\.env\.example$"
git grep -nIE "(sb_secret_|eyJhbGciOi[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)" -- . ":!pnpm-lock.yaml"
```

- [ ] All three print nothing.
- [ ] `git log -p -S"sb_secret_" --all` finds nothing in history either. If a secret was ever committed,
      rotate it in the dashboard: removing it from git is not enough.
- [ ] `pnpm preflight` (when #120 is merged) runs the first two checks on every change.

## 6. Smoke tests

Run each against the deployed web app and the installed APK, as the roles named, in a pilot organisation.
Write the result (pass, fail, what you saw) in #58. **A FEATURES.md row stays unticked until its smoke test
passes here**; these are the rows that still block a tick.

Setup: one owner (the first sign-up), then invite a project manager, a supervisor and an accountant.
Use a test site with a real pin near where the phone will be.

| # | Flow | Steps | Pass looks like | Unblocks |
| :-- | :-- | :-- | :-- | :-- |
| S1 | Sign up and verify | Sign up on the web; open the verification email; follow the link | Email arrives from the organisation mailbox; link lands signed in on the dashboard | Sign in; Create an organisation |
| S2 | Organisation | Create the organisation with name, timezone, INR | It shows on the dashboard; a second organisation cannot see it | Create an organisation |
| S3 | Invite | Owner invites by email and by copied link; accept each in a private window | Both work; the link expires after 72 hours; a revoked link fails | Invite a team member |
| S4 | Sites and assignment | Owner creates a site; assigns the supervisor; archives a second test site | Supervisor sees only the assigned site; the archived one is read-only | (Sites ticks stay; web screens confirmed) |
| S5 | Worker import | Import a small CSV/Excel of workers keyed on worker code, twice | Second import updates, not duplicates; a bad row is reported | Bulk import workers |
| S6 | Phone sign-in | Sign in on the APK as the supervisor, then turn on airplane mode | The signed-in screen still opens offline | Sign in (mobile half) |
| S7 | Check in/out | On the phone, inside the geofence: check in, check out; then check in from outside with a reason; then deny location | Location asked once, on the tap; inside saves at once; outside asks for a reason; denial still allows a check-in with a reason; row says "On the server" only after sync | Check in and check out |
| S8 | Day register | Phone, airplane mode: mark everyone present, change one worker, reconnect | Records go to the server in order; entries show "On the server"; nothing was sent twice | Mark everyone present |
| S9 | Approval | Web, as project manager: approve the day; then on the phone edit an entry for that day and propose a correction | The late edit shows "needs attention"; the correction appears for review; nobody can review a day they recorded | Manager approves or rejects a day |
| S10 | Daily report | Phone, offline: draft a report, then file it with a blocker and safety flag; reconnect | Headcount pre-filled from attendance; draft survives a restart; filed report reaches the web | Save an offline draft; File a report |
| S11 | Report review | Web, as manager: send the report back with a reason, resubmit, approve | Status words match; no one reviews their own report | A manager approves or sends back a report |
| S12 | Wage summary | Web, as accountant: build a period over approved days; check rate, days, overtime, adjustments, total; export CSV and Excel | The export matches the screen | Shows rate, payable days…; Export to CSV and Excel |
| S13 | Offline sync | Phone: airplane mode, do S7 to S10 captures, then reconnect | Every record shows pending, then synced; a conflict reads "needs attention"; nothing says "submitted" early | The three Offline Sync rows |
| S14 | Roles refused | Sign in as supervisor and accountant on the web and try the manager pages; call a manager function as them | Redirected or refused; no data from another organisation | (Confirms RLS; no tick) |
| S15 | Owner export | Owner downloads the organisation export | One ZIP of CSVs of the owner's own data; a second request inside the hour limit works, the sixth is refused | A customer can export all of their own data |

If a smoke test fails, do not tick the row; open an issue with the steps and what you saw.

## 7. Go / no-go

- [ ] Sections 1 to 3 done, with the date and who did them written in #58.
- [ ] Secrets scan clean (section 5).
- [ ] S1 to S15 passed, or the failures are issues the pilot owner has accepted in writing.
- [ ] A backup was taken and a restore was tested.
- [ ] The people on the pilot know how to report a problem and that data entered during the pilot is real.
