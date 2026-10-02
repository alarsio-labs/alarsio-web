# Alarsio — Project Memory

Claude Code reads this file automatically at the start of every session. It is the
single most important file in the repository. Keep it short and true.

## What we are building

Alarsio is an offline-first construction operations platform for small Indian
contractors running 2–20 active sites. A supervisor captures the essential site
record with no internet; an owner trusts the resulting data enough to make a
decision.

The MVP is **nine modules**, listed in `docs/FEATURES.md`. Nothing outside that
list is in scope. If a request implies a tenth module, stop and say so.

## Team

| Person | Owns |
| :-- | :-- |
| Manish Tiwari | Sites · Attendance & Site Presence |
| Ishant Bhoyar | Identity & Access · Workforce |
| Nikhil Mehta | Offline Sync · Materials & Inventory |
| Anuradha Tiwari | Audit, Retention & Guards · Daily Reporting |
| *(paired, week 7)* | Wage Summaries — Ishant + Manish, since it reads their modules |

## This is a rebuild, not a port

An earlier version of this product exists. **Do not copy its code.** It is a
reference for *what* the product does, never for *how* to build it. We know its
weaknesses and we are fixing them deliberately — see `docs/IMPROVEMENTS.md`.

When you are tempted to paste something from the old repo: read it, understand
the rule it encodes, then write it fresh here with the boundary the architecture
now demands.

## Stack

- **Web** — Next.js App Router, TypeScript, Tailwind, Server Components
- **Mobile** — Expo / React Native, TypeScript, `expo-sqlite` for the offline outbox
- **Backend** — Supabase: PostgreSQL, Auth, Storage, PostgREST. No custom API server.
- **Monorepo** — pnpm workspaces + **Turborepo** for task running and caching

## Monorepo layout

```
apps/web        Next.js dashboard
apps/mobile     Expo / React Native field app
packages/types  shared TypeScript types, generated from the Supabase schema
packages/config Shared eslint + tsconfig, consumed by every app
supabase/       migrations and SQL test suites
docs/           the specs that drive the work
```

**Turborepo rules:**

- Every task runs through `turbo`, never directly in an app folder. `turbo` knows
  the dependency graph and caches results; running `next build` by hand does not.
- A package must declare what it depends on in its own `package.json`. Turbo builds
  the graph from that. If you import across packages without declaring it, the
  cache will hand you a stale build.
- `packages/types` has no runtime dependencies and builds before everything else.
- Never add a dependency to the root `package.json` unless every workspace needs it.
  App dependencies belong in that app's `package.json`.

## Rules that are not negotiable

These come from `docs/ARCHITECTURE.md`. Breaking one is a blocking review comment.

1. **Row Level Security is the authorization boundary.** Every table and every
   view has RLS. Never disable it, never work around it in application code.
2. **The service-role key is used nowhere in application code.** Every query runs
   as the signed-in user. If something needs elevated rights, write a narrow
   `SECURITY DEFINER` function that checks the caller itself.
3. **One writer per table.** To change another module's data, call that module's
   published function. Never write to a table your module does not own.
4. **No MVP module may call, join to, or read a module from a later release.**
   If you need Approvals, Procurement, BOQ or Sales — stop. Those are post-MVP.
5. **Ledgers are append-only.** Corrections are new rows, never updates.
6. **Offline first.** A field feature ships only when it works with no connectivity.
7. **Secrets never enter git.** Only `.env.example` with placeholder values.

## Four roles, and only four

`owner` · `project_manager` · `supervisor` · `accountant`

Do not introduce `admin`, `director`, `site_engineer` or `founder`. They are
deferred. Only the `owner` may reopen a locked wage period; an `accountant` may
lock one but never reopen it.

## How we work

Read `docs/WORKFLOW.md` before your first task. The short version:

**Plan → Spec → Generate → Validate.** No code is written before a spec exists
in the issue. No PR merges without a human review.

## Commands

```bash
pnpm install                   # install every workspace
pnpm dev                       # turbo run dev — all apps in watch mode
pnpm dev --filter=web          # just the Next.js dashboard
pnpm dev --filter=mobile       # just the Expo app

pnpm typecheck                 # must pass before every commit
pnpm lint                      # must pass before every commit
pnpm test                      # unit tests across all workspaces
pnpm build                     # turbo run build, cached

pnpm test:db                   # SQL suites against throwaway Postgres (needs Docker)
```

`--filter` is how you scope work to one app. Learn it early — it is the difference
between a 4-second run and a 90-second one.

## Conventions

- **Branches** — `feat/<module>-<thing>`, `fix/<thing>`, `chore/<thing>`,
  `docs/<thing>`. Example: `feat/attendance-roster`.
- **Commits** — imperative mood, one logical change. `Add geofence check to site visit`.
- **Files** — kebab-case for files, PascalCase for React components.
- **SQL** — one migration per change, named `YYYYMMDDHHMMSS_short_description.sql`.
  Migrations are append-only; never edit one that has been merged.
- **Types** — no `any`. If a type is hard, say so rather than widening it.

## When working with me (Claude)

- **Plan before you code.** For anything above a one-line fix, use plan mode and
  show the plan first.
- **Read before you write.** Check `docs/ARCHITECTURE.md` and the module's
  existing code before proposing a change.
- **Say when you are unsure.** A wrong confident answer costs more than a question.
- **Never invent a table, column, function or role.** If it is not in
  `docs/ARCHITECTURE.md`, it does not exist yet — propose it as a decision instead.
- **Keep diffs small.** One module, one concern, one PR.
- **Do not commit or push unless asked.**

## Where the truth lives

| Question | File |
| :-- | :-- |
| What are we building and why? | `docs/PRD.md` |
| What are the modules and their boundaries? | `docs/ARCHITECTURE.md` |
| What is in the MVP, who owns it, what is done? | `docs/FEATURES.md` |
| Why did we choose X over Y? | `docs/DECISIONS.md` |
| How do we work day to day? | `docs/WORKFLOW.md` |
| What must a security review check? | `docs/SECURITY.md` |
| How do we test? | `docs/TESTING.md` |

The full architecture and roadmap PDFs are in `docs/reference/`.
