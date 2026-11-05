# Alarsio Web (`apps/web`)

Next.js dashboard (App Router, TypeScript, Tailwind, Server Components) for owners, project managers and accountants. It reads and writes Supabase as the signed-in user. There is no custom API server.

Rules that apply here (from the root `CLAUDE.md`): RLS is the security boundary, no service-role key anywhere, one writer per table, secrets never in git.

Source of truth for deploy: `docs/DEPLOY.md` sections 1, 2, 4, 5 and 6.

## 1. Quick facts

| Item | Value |
| :-- | :-- |
| Framework | Next.js (App Router) with Server Components |
| Host | Vercel, Root Directory `apps/web` |
| Backend | Supabase (the one team project, #58, also production for the pilot) |
| Shared types | `@alarsio/types` (workspace package, generated from the Supabase schema) |
| Tests | Vitest |
| Package manager | pnpm from `packageManager` in the root `package.json` (`pnpm@9.12.0`) |

## 2. Folder layout

```
apps/web
├── next.config.ts, postcss.config.mjs, eslint.config.mjs, vitest.config.ts
├── .env.local          Local dev variables (gitignored, never commit)
├── public/             Static files
└── src/
    ├── proxy.ts        Request proxy (auth and route protection), tested in proxy.test.ts
    ├── roles.test.ts   Role checks
    ├── components/     Shared UI components
    ├── test-support/   Test helpers
    ├── app/
    │   ├── page.tsx, layout.tsx   Landing page and root layout
    │   ├── (site)/     Public pages: about, contact, privacy, terms
    │   ├── (auth)/     sign-in, sign-up, check-email, invite
    │   ├── auth/confirm   Email verification landing
    │   ├── (app)/      Signed-in screens: dashboard, overview, sites, workers, team,
    │   │               attendance, reports, materials, wages, export
    │   └── robots.ts, sitemap.ts, manifest.ts, icon.tsx, opengraph-image.tsx
    └── lib/            One folder per module (sites, workers, attendance, reports,
                        materials, wages, export, overview, dashboard, landing, email),
                        plus supabase/, env.ts, dates.ts, messages.ts,
                        safe-redirect.ts, profile.ts, uuid.ts
```

## 3. Environment variables (names only)

Read in code through `src/lib/env.ts` where possible. Placeholders are in the root `.env.example`.

| Name | Public? | Used for |
| :-- | :-- | :-- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes (sent to browsers) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | **Publishable** key only |
| `NEXT_PUBLIC_SITE_URL` | yes | Invite and verification links, SEO metadata |
| `NEXT_PUBLIC_CONTACT_EMAIL` | yes | Contact page |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` | **no** (server only) | Invite emails |
| `SMTP_PASSWORD` | **no** (mark Sensitive in Vercel) | Invite emails |
| `EMAIL_FROM` | **no** | Invite email sender |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `YANDEX_VERIFICATION` | optional | Search console verification |

- Local dev: `apps/web/.env.local` (gitignored).
- Deployed: set in Vercel, never in a file.
- If the SMTP variables are empty, the app still works: the owner copies the invite link.
- **Never** add a service-role variable (rule 2).
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one needs a redeploy.

## 4. Local development

From the repo root in Git Bash:

```bash
pnpm install
pnpm dev --filter=web           # Next.js dev server
pnpm typecheck                  # before every commit
pnpm lint                       # before every commit
pnpm test                       # Vitest and the other workspaces
pnpm build                      # turbo run build
```

Always run tasks through `turbo` (via the root `pnpm` scripts), not `next build` by hand.

## 5. Deploy to Vercel (DEPLOY.md section 2)

1. Import the GitHub repository in Vercel. Framework preset: Next.js.
2. **Root Directory** `apps/web`. Turn on "Include source files outside of the Root Directory".
3. Install command `pnpm install --frozen-lockfile`. Build command `pnpm build`. Node 20 or newer.
4. Production branch `main`. Pull requests get preview deployments. Previews use the same Supabase project, so do not run destructive tests on a preview.
5. Set the variables from section 3, then deploy.
6. Put the deployed address into Supabase Auth **Site URL** and **Redirect URLs** (`https://<web-address>/auth/confirm` and `https://<web-address>/invite/**`) **and** into `NEXT_PUBLIC_SITE_URL`. All three must agree.
7. Check: `/sign-in` loads over HTTPS, and a verification email's link lands on `/auth/confirm`.

Rollback: Vercel "Promote to production" on the last good deployment. The database stays ahead of the app, which is safe because migrations only add.

## 6. Secrets scan

Run the three commands in `docs/DEPLOY.md` section 5 from the repo root before each deploy. Each should print nothing (the only expected hits are the lines in `docs/DEPLOY.md` that document the patterns). The commands are not repeated here so this file does not trip its own scan.

Result on 2026-11-04: scans 1 and 2 printed nothing, scan 3 matched only `docs/DEPLOY.md`.

## 7. Web smoke tests (S1 to S5, S9, S11, S12, S14, S15)

Run on the deployed web app in a pilot organisation, never a customer's. Setup: one owner (the first sign-up), then invite a project manager, a supervisor and an accountant. Record each result in #58. A row in `docs/FEATURES.md` stays unticked until its test passes.

| # | Flow | Steps | Pass looks like | Result |
| :-- | :-- | :-- | :-- | :-- |
| S1 | Sign up and verify | Sign up; open the verification email; follow the link | Email arrives from the organisation mailbox. Link lands signed in on the dashboard | [ ] |
| S2 | Organisation | Create the organisation (name, timezone, INR) | Shows on the dashboard. A second organisation cannot see it | [ ] |
| S3 | Invite | Owner invites by email and by copied link; accept each in a private window | Both work. Link expires after 72 hours. A revoked link fails | [ ] |
| S4 | Sites and assignment | Owner creates a site, assigns the supervisor, archives a second test site | Supervisor sees only the assigned site. Archived one is read-only | [ ] |
| S5 | Worker import | Import a small CSV or Excel of workers keyed on worker code, twice | Second import updates, no duplicates. A bad row is reported | [ ] |
| S9 | Approval (web half) | As project manager: approve the day | The phone edit afterwards shows "needs attention" (see `apps/mobile`) | [ ] |
| S11 | Report review | As manager: send the report back with a reason, resubmit, approve | Status words match. No one reviews their own report | [ ] |
| S12 | Wage summary | As accountant: build a period over approved days; check rate, days, overtime, adjustments, total; export CSV and Excel | Export matches the screen | [ ] |
| S14 | Roles refused | As supervisor and accountant, try the manager pages and call a manager function | Redirected or refused. No data from another organisation | [ ] |
| S15 | Owner export | Owner downloads the organisation export | One ZIP of CSVs of the owner's own data. A second request inside the hour limit works, the sixth is refused | [ ] |

If a test fails, do not tick the row. Open an issue with the steps and what you saw.

## 8. Status and open items

The app is live at https://www.alarsio.com (`alarsio.com` redirects to it). The Vercel address `alarsio-web.vercel.app` serves the same app, but use the custom domain for all testing so verification and invite links match. `smoke-test-log-2026-10-30.md` records a manual test made on the Vercel address (Vercel, `main` at `482fb2c`). This session did not change `apps/web` code or deploy it, so check the current deployment before you rely on it.

- [x] Vercel project created and deployed (DEPLOY.md section 2).
- [ ] Supabase Auth Site URL, Redirect URLs and custom SMTP set to match the deployed address.
- [ ] Smoke tests above run and recorded in #58.
- [ ] Matching rows ticked in `docs/FEATURES.md`.

## 9. Troubleshooting

| Problem | Fix |
| :-- | :-- |
| Verification or invite link points at the wrong host | `NEXT_PUBLIC_SITE_URL`, Supabase Site URL and Redirect URLs disagree. Make all three match, then redeploy |
| Redirected away from a manager page | Expected for supervisor and accountant roles (S14) |
| Invite email not sent | SMTP variables are empty or wrong. The owner can copy the invite link instead |
| Vercel build cannot find `@alarsio/types` | Turn on "Include source files outside of the Root Directory" |
| Stale build after editing another package | Declare the dependency in `apps/web/package.json` so Turborepo's graph is correct |
