---
description: Run every gate, then prepare the commit and PR
---

Take this branch from "code written" to "ready for human review".

1. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`. If anything fails, fix it and
   run again. Do not continue with a red build.
2. If SQL changed, run `pnpm test:db`.
3. Run the `/review` checks on the diff and fix anything you find.
4. Run the `docs/SECURITY.md` checklist against the diff and report the result.
5. Check `docs/FEATURES.md` is updated if this adds a feature.
6. Show me `git status` and the proposed commit message. **Ask before committing.**
7. After I approve, commit and push the branch.
8. Draft the PR body from `.github/pull_request_template.md`, filling in what you
   actually did and actually checked. Do not tick a box you did not verify.

Stop before creating the PR and show me the body first.
