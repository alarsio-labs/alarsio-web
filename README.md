# Alarsio

Offline-first construction operations for small Indian contractors.

A supervisor captures the essential site record with no internet. An owner trusts
the result enough to make a decision.

## Start here

| You want to | Read |
| :-- | :-- |
| Set up your machine | `docs/ONBOARDING.md` |
| Know how we work | `docs/WORKFLOW.md` |
| Know what we're building | `docs/PRD.md` |
| Know the module boundaries | `docs/ARCHITECTURE.md` |
| Know what's in scope and who owns it | `docs/FEATURES.md` |
| Know why we chose something | `docs/DECISIONS.md` |
| Know what we're doing better this time | `docs/IMPROVEMENTS.md` |

The full team guide is `docs/reference/alarsio-team-guide.pdf`.

## Quick start

```bash
pnpm install
cp .env.example apps/web/.env.local     # fill in your Supabase values
pnpm dev --filter=web
```

## Layout

```
apps/web         Next.js dashboard
apps/mobile      Expo field app
packages/types   shared types, generated from the Supabase schema
packages/config  shared eslint + tsconfig
supabase/        migrations and SQL tests
docs/            the specs that drive the work
.claude/         Claude Code commands, subagents and skills
```

## Commands

```bash
pnpm dev           # all apps
pnpm dev --filter=web
pnpm typecheck     # before every commit
pnpm lint
pnpm test
pnpm test:db       # SQL suites, needs Docker
```

## Team

Manish Tiwari · Ishant Bhoyar · Nikhil Mehta · Anuradha Tiwari

## Licence

Proprietary. All rights reserved.
