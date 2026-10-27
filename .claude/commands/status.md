---
description: Where the work stands: branch, dirty files, open PRs and CI, newest migration and ADR, next step
---

Report in under 15 lines, from commands you run now, not from memory.

1. **Branch** — `git status -sb`: branch, ahead or behind `origin/main`.
2. **Dirty files** — staged, unstaged and untracked, grouped; name any forbidden file
   (`supabase/config.toml`, `.env*`, root drafts).
3. **Open PRs and CI** — `gh pr list --state open` with each PR's check state from
   `gh pr checks <n>`. If `gh` cannot reach GitHub, say "gh unreachable" and skip this.
4. **Newest migration** — the highest version under `supabase/migrations/` on this
   branch and on `origin/main`.
5. **Newest ADR** — the highest number in `docs/DECISIONS-INDEX.md`. Note any number
   listed twice.
6. **Next step** — one line, from the PR protocol in `docs/PLAYBOOK.md`: what is
   waiting on a person, and what you would do next.

Change nothing.
