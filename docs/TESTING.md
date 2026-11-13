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

## Performance budget (web)

Our users run old laptops and cheap phones. A web change that adds client JavaScript, a
canvas, an animation or a scroll/resize handler is checked against this budget before its PR:

| Measure | Budget |
| :-- | :-- |
| Total Blocking Time | under 200 ms |
| Largest Contentful Paint | under 2.5 s |
| Cumulative Layout Shift | under 0.1 |
| Any single task while loading or scrolling | under 100 ms |

Measured at **4x CPU throttle**, Lighthouse mobile, against a production build, never
`pnpm dev`. 6x is reported but does not gate. Put before and after numbers in the PR.

```bash
pnpm build --filter=web && pnpm --filter=web start -p 3100     # production build
npx lighthouse@12.8.2 http://localhost:3100/ --only-categories=performance \
  --throttling-method=devtools --throttling.cpuSlowdownMultiplier=4 \
  --chrome-flags="--headless=new" --output=json --output-path=./lh-home-4.json
```

Run it for `/`, `/sign-in`, `/sign-up` and `/dashboard`. Lighthouse prints the machine's
`benchmarkIndex` in the report: on a slow machine (under ~1000) 4x behaves like a stronger
throttle and TBT is noisy, so compare before and after on the same machine, and also compare
total main-thread work (`mainthread-work-breakdown`).

Rules that come from real incidents (#158, #159):

- **No loop may step by a value that can be 0.** A canvas 0 px wide made `x += w / 8` loop
  forever and froze the page. Loop by count, and return early for a box under 1 px.
- **No animation loop that runs for as long as the page is open.** Decorative canvases are
  drawn once and on resize, not every frame.
- **Freeze check:** load the page in a 0x0 and a 1024x60 iframe and confirm it still answers.
  A canvas or layout bug that only shows at tiny sizes still freezes real users.

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

`supabase/tests/run.sh` starts a throwaway `postgres:15.19` in Docker (a pinned point
release, so a new image cannot change results overnight; override with `PG_IMAGE`), applies
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
In CI the same line also appears as an annotation on the run.

**Migration names are checked first**, before Docker starts. Every file must be
`YYYYMMDDHHMMSS_short_description.sql`, and no two files may share the 14-digit
version: `supabase db push` tracks a migration by that version alone (#44). Pick a
timestamp later than every file on `main` when you rebase, not when you branch.

**Schema guards check every migration (ADR-024).** Two suites read the catalog
after every migration is applied, so they cover your new table without you adding
it anywhere:

- `audit_coverage_test.sql`: every table has `write_audit()` attached `AFTER INSERT
  OR UPDATE OR DELETE FOR EACH ROW`, and a `uuid` `id`.
- `schema_guards_test.sql`: RLS on every table, views `security_invoker`, `SECURITY
  DEFINER` functions with `search_path = public` and revoked from `public, anon`, no
  client DELETE or TRUNCATE, and no table, view or column privilege for `anon`.

Like a hosted project, the shim grants everything in `public` to `anon` and
`authenticated` by default, so a migration that forgets its `revoke all … from
public, anon, authenticated` fails here.

If one fails, the message names the object and the rule it breaks, for example:

```
ASSERT FAILED: audit coverage: table public.wage_lines has no write_audit trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW
```

Fix the migration rather than the guard. A real exception needs a line in the suite
and an ADR.
