---
description: Review the current branch against our architecture rules
---

Review the changes on this branch as a strict reviewer who did not write them.

Run `git diff main...HEAD` and read every changed file.

Check, in order:

1. **Module boundary** — does anything write to a table its module does not own?
   Does anything reference a post-MVP module?
2. **Scope** — does the diff do more than the issue asked? Flag anything extra.
3. **RLS** — new table or view without RLS? New policy with an inline role check
   instead of a named predicate?
4. **Secrets** — service-role key, token, real credential, or PII in a log line.
5. **Types** — any `any`, any swallowed error, any `TODO` left behind.
6. **Tests** — is there a test for the failure case, not only the happy path?
7. **Docs** — if this adds a feature, is `docs/FEATURES.md` updated in the same
   diff? If it makes a non-obvious choice, is there a `docs/DECISIONS.md` row?

Report findings most serious first. For each: file, line, what is wrong, and the
concrete fix. Say plainly if you find nothing — do not invent findings to seem useful.
