---
description: Run the local pre-commit checks and only the gates the diff needs
---

Run `pnpm preflight` and report its output as it is.

1. Say which rules failed, with the file or version each names, and the fix.
2. Say what ran and what was skipped, from the `Ran:` and `Skipped:` lists.
3. Do not call anything passed that is not in the `Ran:` list as passed. Preflight
   does not run `/review`, `/security-review`, `module-guard` or `doc-keeper`.

Do not commit, push or change files to make it pass without asking first.
