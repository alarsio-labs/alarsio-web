# Testing

## What we test, and where

| Layer | Tool | What it covers |
| :-- | :-- | :-- |
| Database | SQL suites, `pnpm test:db` | RLS, policies, constraints, functions |
| Web | Vitest + Testing Library | Components, hooks, server actions |
| Mobile | Jest + React Native Testing Library | Outbox, sync, screens |
| Types | `pnpm typecheck` | The contract between packages |

## The rule

**Every PR adds at least one test, or explains in the PR why it does not.**

A test that cannot fail is not a test. Write the failing version first and watch
it fail, then make it pass.

## What must be tested, always

- **Every RLS policy, positively and negatively.** It is not enough to prove a
  supervisor sees their site; prove they cannot see the other one.
- **Every offline path.** Capture with no network, kill the app, reopen, sync.
- **Every money calculation**, by hand, with a worked example in the test.
- **Every constraint.** If periods cannot overlap, write the test that tries.

## Manual testing before you open a PR

Run through the unhappy path, not just the happy one:

- [ ] Airplane mode on — does capture still work?
- [ ] Airplane mode off — does it sync without duplicating?
- [ ] Sign in as a `supervisor` — is anything visible that should not be?
- [ ] Submit the form empty, then with nonsense, then with a huge value
- [ ] Reload mid-action — is anything left half-written?

## Running things

```bash
pnpm test                      # everything
pnpm test --filter=web         # one workspace
pnpm test:db                   # SQL suites (needs Docker running)
pnpm test:db sync_push         # one SQL suite: supabase/tests/sync_push_test.sql
pnpm typecheck && pnpm lint    # before every commit
```

CI runs all of these on every PR. A red build does not get reviewed.

## SQL suites (`pnpm test:db`)

`supabase/tests/run.sh` starts a throwaway `postgres:15` in Docker, applies
`support/auth_shim.sql`, then **every** migration in order, then the suites. Name
one or more suites to run only those; every migration is applied either way.
CI runs every suite on every PR (job *SQL suites*).

**One style, no pgTAP.** Suites use the shim helpers, not pgTAP:

| Helper | What it does |
| :-- | :-- |
| `test_as(user_id)` | Act as that signed-in user (`role authenticated`, `auth.uid()` set). `test_as(null)` acts as signed in with no user id |
| `test_as_anon()` | Act as `anon` |
| `test_assert(ok, 'message')` | Raise `ASSERT FAILED: message` unless `ok` is true |

Write each suite as `begin; … rollback;`, so it leaves nothing behind for the next
one, and run `reset role` after acting as a user. Read rows back to check a
write: a write blocked by RLS changes zero rows and raises nothing.

**What a failure looks like.** The runner stops at the first failure, names the
file, and exits non-zero:

```
suite    sync_push_test.sql
psql:<stdin>:288: ERROR:  ASSERT FAILED: a handler that wrote a row and then returned rejected leaves no row
FAILED   suite sync_push_test.sql
```

A migration that does not apply shows `FAILED   migration <file>`, and a suite
with a syntax error shows the `ERROR` line followed by `FAILED   suite <file>`.

**Migration names are checked first**, before Docker starts. Every file must be
`YYYYMMDDHHMMSS_short_description.sql`, and no two files may share the 14-digit
version: `supabase db push` tracks a migration by that version alone (#44). Pick a
timestamp later than every file on `main` when you rebase, not when you branch.
In CI the same line also appears as an annotation on the run.
