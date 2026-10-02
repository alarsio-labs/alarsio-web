## What this does

<!-- One or two sentences. What can a user do now that they could not before? -->

Closes #

## Module

<!-- Which of the nine modules does this belong to? -->

- [ ] This writes only to tables that module owns
- [ ] It does not reference any post-MVP module

## What I checked

<!-- Be honest. This section tells your reviewer where to look. -->

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm test:db` passes (if SQL changed)
- [ ] I tested the failure path, not only the happy path
- [ ] I tested with the network off (if this is a field feature)
- [ ] I ran `/security-review` and worked through `docs/SECURITY.md`

## Tests

<!-- Which tests did you add? If none, say why. -->

## Docs

- [ ] `docs/FEATURES.md` updated
- [ ] `docs/DECISIONS.md` row added (if a non-obvious choice was made)

## For the reviewer

<!-- Where should they look hardest? Anything you are unsure about? -->
