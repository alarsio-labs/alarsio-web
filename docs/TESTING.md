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
pnpm typecheck && pnpm lint    # before every commit
```

CI runs all of these on every PR. A red build does not get reviewed.
