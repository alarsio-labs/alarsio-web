<div align="center">

# Alarsio

**Offline-first construction operations for small Indian contractors.**

A supervisor captures the essential site record with no internet.
An owner trusts the result enough to make a decision.

[Product](#product) · [Architecture](#architecture) · [Getting started](#getting-started) · [Deployment](#deployment) · [Contributing](#contributing) · [Documentation](#documentation)

</div>

---

## Product

Small contractors running 2 to 20 active sites still run on paper registers, Excel, phone calls and WhatsApp. The data exists, but it reaches the office late, sits in several places and cannot be checked. At wage time, the office and the workers argue about whose record is correct.

Alarsio gives each person one record to work from:

| Role | What they do in Alarsio |
| :-- | :-- |
| **Owner** | See every site each day, approve exceptions, check wages, export their data. |
| **Project Manager** | Read daily reports, fix exceptions, approve days, chase missing data. |
| **Site Supervisor** | Check in, mark attendance, file a daily report, record materials, all offline. |
| **Accountant** | Turn approved attendance into a wage summary and export it. |

These four roles are the only roles: `owner`, `project_manager`, `supervisor`, `accountant`.

### MVP scope

The MVP is **nine modules**. Nothing outside this list is in scope.

| # | Module | Owner | What it owns |
| :-- | :-- | :-- | :-- |
| 1 | Identity & Access | Ishant Bhoyar | organizations, profiles, memberships, invites |
| 2 | Sites | Manish Tiwari | sites, site assignments |
| 3 | Workforce | Ishant Bhoyar | workers, worker site assignments, wage rates |
| 4 | Attendance & Site Presence | Manish Tiwari | site visits, attendance days, entries, corrections |
| 5 | Daily Reporting | Anuradha Tiwari | daily reports, revisions, report photos |
| 6 | Materials & Inventory | Nikhil Mehta | materials, material transactions |
| 7 | Wage Summaries | Ishant Bhoyar + Manish Tiwari | wage periods, lines, adjustments, reopens |
| 8 | Offline Sync | Nikhil Mehta | device outbox, `sync_push` |
| 9 | Audit, Retention & Guards | Anuradha Tiwari | audit log, purge log, rate limits |

Live status and acceptance rows are in [`docs/FEATURES.md`](docs/FEATURES.md). Procurement, BOQ, Approvals and Sales are post-MVP and must not be called from the MVP.

### Status

| Item | State |
| :-- | :-- |
| Stage | Pilot, MVP submission on 15 Nov 2026 |
| Web | Next.js dashboard in `apps/web` |
| Mobile | Pilot internal Android APK built with EAS (`in.alarsio.app`) |
| Backend | One Supabase project (team project #58), also production for the pilot |
| Smoke tests | Checklist S1 to S15 in [`docs/DEPLOY.md`](docs/DEPLOY.md); a feature is ticked only after its test passes |

## Architecture

```
┌──────────────────┐        ┌──────────────────┐
│  apps/mobile     │        │  apps/web        │
│  Expo / RN       │        │  Next.js         │
│  SQLite outbox   │        │  Server Components│
└────────┬─────────┘        └────────┬─────────┘
         │  publishable key, signed-in user       │
         └───────────────┬───────────────────────┘
                         ▼
              ┌─────────────────────┐
              │  Supabase           │
              │  Postgres + RLS     │
              │  Auth · Storage     │
              │  PostgREST          │
              └─────────────────────┘
```

There is no custom API server. Every query runs as the signed-in user, and Row Level Security decides what that user can see and change.

### Stack

| Layer | Technology |
| :-- | :-- |
| Web | Next.js (App Router), TypeScript, Tailwind, Server Components |
| Mobile | Expo / React Native, TypeScript, `expo-sqlite` for the offline outbox |
| Backend | Supabase: PostgreSQL, Auth, Storage, PostgREST |
| Monorepo | pnpm workspaces and Turborepo |
| Tests | Vitest (web), Jest (mobile), SQL suites against throwaway Postgres |
| CI | GitHub Actions: typecheck, lint, test, build and database tests |

### Engineering rules

These are enforced in review. Breaking one is a blocking comment. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/SECURITY.md`](docs/SECURITY.md).

1. **Row Level Security is the authorization boundary.** Every table and view has RLS. It is never disabled and never worked around in application code.
2. **No service-role key in application code.** Elevated work goes through a narrow `SECURITY DEFINER` function that checks the caller itself.
3. **One writer per table.** To change another module's data, call that module's published function.
4. **No MVP module reads from a later release.**
5. **Ledgers are append-only.** Corrections are new rows, never updates.
6. **Offline first.** A field feature ships only when it works with no connectivity.
7. **Secrets never enter git.** Only `.env.example` with placeholders.

## Repository layout

```
apps/
  web/               Next.js dashboard             → apps/web/README.md
  mobile/            Expo field app                → apps/mobile/README.md
packages/
  types/             Shared TypeScript types, generated from the Supabase schema
  config/            Shared ESLint and tsconfig
supabase/
  migrations/        Append-only SQL migrations
  tests/             SQL test suites
docs/                Specs that drive the work (PRD, architecture, features, ADRs)
scripts/             Preflight and tooling scripts
.github/             CI workflows
.claude/             Claude Code commands, subagents and skills
```

## Getting started

### Prerequisites

| Tool | Version |
| :-- | :-- |
| Node.js | 20 or newer |
| pnpm | `9.12.0` (pinned in `packageManager` in `package.json`) |
| Docker Desktop | Needed only for `pnpm test:db` |
| Supabase CLI | For migrations: `supabase login` and `supabase link` |
| EAS CLI | Only for mobile builds |

Windows: use Git Bash, not WSL. SQL migrations must use LF line endings.

### Setup

```bash
pnpm install
cp .env.example apps/web/.env.local      # fill in your Supabase values (NEXT_PUBLIC_* lines)
cp .env.example apps/mobile/.env.local   # same file, use the EXPO_PUBLIC_* lines
pnpm dev --filter=web
```

Use the Supabase **publishable** key only. There is no service-role variable anywhere, and there must not be one.

### Environment variables

| Name | Where | Public |
| :-- | :-- | :-- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL` | Web (Vercel) | yes |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Web (Vercel, server only) | no |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Mobile (EAS `preview` environment) | yes, compiled into the APK |

Full table in [`docs/DEPLOY.md`](docs/DEPLOY.md) section 4.

### Commands

Every task runs through Turborepo. Use `--filter` to scope work to one app.

```bash
pnpm dev                       # all apps in watch mode
pnpm dev --filter=web          # Next.js dashboard only
pnpm dev --filter=mobile       # Expo app only

pnpm typecheck                 # must pass before every commit
pnpm lint                      # must pass before every commit
pnpm test                      # unit tests across all workspaces
pnpm build                     # cached build

pnpm test:db                   # SQL suites against throwaway Postgres (needs Docker)
pnpm preflight                 # branch, forbidden files, migration and index rules, then only the gates the diff needs
```

## Testing

| Level | Tool | Command |
| :-- | :-- | :-- |
| Web unit | Vitest | `pnpm test --filter=web` |
| Mobile unit | Jest | `pnpm test --filter=mobile` |
| Database and RLS | SQL suites | `pnpm test:db` |
| End to end on real devices | Smoke tests S1 to S15 | [`docs/DEPLOY.md`](docs/DEPLOY.md) section 6 |

Strategy and conventions are in [`docs/TESTING.md`](docs/TESTING.md).

## Deployment

| Part | Target | Guide |
| :-- | :-- | :-- |
| Database | Supabase, `supabase db push` after a dry run | [`docs/DEPLOY.md`](docs/DEPLOY.md) section 1 |
| Web | Vercel, root directory `apps/web` | [`apps/web/README.md`](apps/web/README.md) |
| Mobile | EAS internal Android build, profile `pilot` | [`apps/mobile/README.md`](apps/mobile/README.md) |

Before each release, run the secrets scan in [`docs/DEPLOY.md`](docs/DEPLOY.md) section 5. Each command must print nothing.

## Contributing

**Plan → Spec → Generate → Validate.** No code is written before a spec exists in the issue, and no pull request merges without a human review.

- **Branches:** `feat/<module>-<thing>`, `fix/<thing>`, `chore/<thing>`, `docs/<thing>`
- **Commits:** imperative mood, one logical change, for example `Add geofence check to site visit`
- **Files:** kebab-case for files, PascalCase for React components
- **SQL:** one migration per change, named `YYYYMMDDHHMMSS_short_description.sql`. Migrations are append-only: never edit one that has been merged.
- **Types:** no `any`
- **Pull requests:** one module, one concern, with `pnpm typecheck`, `pnpm lint` and `pnpm test` passing

Read [`docs/WORKFLOW.md`](docs/WORKFLOW.md) before your first task and [`docs/ONBOARDING.md`](docs/ONBOARDING.md) to set up your machine.

## Documentation

| Question | File |
| :-- | :-- |
| What are we building and why? | [`docs/PRD.md`](docs/PRD.md) |
| What are the modules and their boundaries? | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| What is in the MVP, who owns it, what is done? | [`docs/FEATURES.md`](docs/FEATURES.md) |
| Which decisions exist? | [`docs/DECISIONS-INDEX.md`](docs/DECISIONS-INDEX.md) |
| Why did we choose X over Y? | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| What are we doing better than the first version? | [`docs/IMPROVEMENTS.md`](docs/IMPROVEMENTS.md) |
| How do we work day to day? | [`docs/WORKFLOW.md`](docs/WORKFLOW.md) |
| How does it look? | [`docs/DESIGN.md`](docs/DESIGN.md) |
| What must a security review check? | [`docs/SECURITY.md`](docs/SECURITY.md) |
| How do we test? | [`docs/TESTING.md`](docs/TESTING.md) |
| How do we deploy and smoke test? | [`docs/DEPLOY.md`](docs/DEPLOY.md) |

The full architecture and roadmap PDFs are in `docs/reference/`.

## Team

| Person | Owns |
| :-- | :-- |
| Manish Tiwari | Sites · Attendance & Site Presence |
| Ishant Bhoyar | Identity & Access · Workforce |
| Nikhil Mehta | Offline Sync · Materials & Inventory |
| Anuradha Tiwari | Audit, Retention & Guards · Daily Reporting |
| Ishant Bhoyar + Manish Tiwari | Wage Summaries (paired, week 7) |

## Licence

Proprietary. All rights reserved.
