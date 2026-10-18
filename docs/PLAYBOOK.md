# Playbook — how Claude builds a feature, fixes a bug, reviews a PR

This is the runbook Claude Code follows end to end. `docs/WORKFLOW.md` says how the
team works; this file says exactly what Claude does at each step, so a person only
decides and reviews. Read `CLAUDE.md` first. Where the two disagree, `CLAUDE.md` wins.

**Claude does the work itself** with its tools: reads, edits, `git`, `gh`, `pnpm`,
agents. A person decides, reads every line, and approves. Three things never happen
without that person saying so in the current chat: **commit, push, open a PR** (the
permission prompts in `.claude/settings.json` back this up), and **merge**.
If a session says "print the commands, I run them", do that instead.

---

## 0 · Rules that hold on every path

1. **Plan → Spec → Generate → Validate.** No code before an agreed spec (a bug fix
   needs the failing test instead, see B1).
2. **Tests first**, and watch them fail for the right reason before writing the code.
3. **Never say "passed", "fixed" or "ready" until you have seen the output.** Say
   what you ran, and what you did not run.
4. **Say judgment calls, assumptions and gaps** in one line each. Never invent a
   table, column, function or role that is not in `docs/ARCHITECTURE.md`; propose it
   as a decision.
5. **One module, one concern, one PR.** If the work spans two modules, stop and say so.
   If a PR would pass about 800 lines of non-test SQL, stop and say where to split.
6. **Keep replies short.** Stop only at: a decision (options, a recommendation, a short
   reason), spec approval, output you need the person to paste, and reviews.
7. The non-negotiables from `CLAUDE.md`: RLS on every table and view, no service-role
   key anywhere, one writer per table, no post-MVP module, append-only ledgers, offline
   first, no secrets in git, four roles only, no `any`.

---

## A · Implement a new feature

**A1 · Intake.** Read the issue (`gh issue view N --comments`) and every comment: the
agreed answers live there. Read `CLAUDE.md`, `docs/ARCHITECTURE.md`,
`docs/FEATURES.md`, `docs/WORKFLOW.md`, `docs/SECURITY.md`, `docs/TESTING.md` and the
ADRs the module already cites. Confirm the work is in `FEATURES.md`. If it is not, or
it implies a tenth module, **stop and say so**.

**A2 · Sync and check for collisions.** Update `main`, then look at *every* open
branch, not only `main`:

```bash
git fetch origin
git status -sb
git for-each-ref --format='%(refname:short)' refs/remotes/origin | while read b; do git ls-tree -r --name-only "$b" -- supabase/migrations; done | sort -u | tail -8
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin); do git show "$b:docs/DECISIONS.md" 2>/dev/null | grep -H --label="$b" '^## ADR-' | tail -1; done
```

Pick a migration version **later than every file on every branch**, unique, and the
next free ADR number. Create the branch from `main`: `feat/<module>-<thing>`,
`fix/<thing>`, `chore/<thing>`, `docs/<thing>`.

**A3 · Spec.** Run `/spec`. Give the sections it lists plus the **open decisions with
options and a recommendation**. Do not write code. Ask for approval. After approval,
post it on the issue (`gh issue comment N --body-file <file>`) and record the choices
as a new ADR in `docs/DECISIONS.md` (**Proposed**, with Context, Decision,
Consequences and the honest costs).

**A4 · Tests first.** Write the negative cases before the positive ones. For SQL, in
the house style (`supabase/tests/*_test.sql`, `begin; … rollback;`, `test_as`,
`test_as_anon`, `test_assert`):
- every role × select / insert / update / delete, allowed and refused;
- every constraint and every boundary (inside, on the edge, outside);
- cross-organisation id swap on every table, and `anon`;
- a blocked write changes 0 rows or raises the SQLSTATE you assert, and leaves **no
  audit row**;
- replay: the same id twice is a duplicate, not a second row.
Use dates relative to `current_date`, never literals. Run the suite and **show the
failure**. The `test-writer` agent may help; it does not replace reading the result.

**A5 · Implement**, in this order, after each file saying in one line what it does and
why it belongs in the module:
1. migration (new file, never edit a merged one; `YYYYMMDDHHMMSS_short_description.sql`);
2. RLS policies using **named predicates** (`has_site_access`, `can_record_on_site`,
   `can_review_site`, `can_manage_sites`, `can_view_wages`), never an inline role;
3. types in `packages/types`;
4. server logic;
5. UI;
6. mobile outbox changes, if a field feature (it must work with the network off).

SQL house rules: `alter table … enable row level security`; `revoke all … from public,
anon, authenticated` then only the **column-limited** grants the client needs; no
delete or truncate grant; composite foreign keys that tie a row to its organisation;
`write_audit()` attached `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW`; views are
`security_invoker`; every `SECURITY DEFINER` function sets `search_path = public` and
is revoked from `public, anon`; server-stamped columns have no client grant; check
order inside one insert is BEFORE triggers → policy `WITH CHECK` → constraints and
foreign keys → AFTER triggers, which decides the SQLSTATE a test expects. A sync
handler is `sync_<table>(p_record_id uuid, p_payload jsonb) returns sync_result`,
`SECURITY INVOKER`, and **casts** what it returns (`('accepted', null)::public.sync_result`);
a lock trigger raises `PS409`.

**A6 · Gates.** Install with the pinned pnpm (`packageManager`, currently 9.12.0), then:

```bash
pnpm install --frozen-lockfile
pnpm test:db        # needs Docker; on Windows put C:\Program Files\Git\bin on PATH first
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git grep -n service_role -- apps packages supabase     # must print nothing
```

Fix anything red and run again. Never continue on a red build. Do not regenerate the
lockfile to get past an install error; report it.

**A7 · Review the diff.** Run the `module-guard` agent and the `doc-keeper` agent
(both report only), then `/review`, then `/security-review` on the committed or staged
change (an untracked file is not in a plain diff), and walk `docs/SECURITY.md` by hand.
Treat agent output as model output: verify each finding against the code, apply the
ones that hold, and say which you declined and why.

**A8 · Docs, in the same PR.** `docs/FEATURES.md`: tick **only** the rows a named test
proves; a row whose wording needs a screen or the phone stays unticked, with a note.
`docs/ARCHITECTURE.md`: any new published function or view. `docs/DECISIONS.md`: the
ADR. A migration without a `FEATURES.md` change fails Scope guard.

**A9 · Commit** (only when the person says to). `git add` **specific files**, never
`.` or `-A`. Never stage a working file (spec drafts, message files), `.env*`, or
`supabase/config.toml`. Imperative subject saying *what*, body saying *why*, ending
with the `Co-Authored-By` trailer. Show `git status` and the message first.

**A10 · Open the PR** (only when told). Push without force. Fill
`.github/pull_request_template.md` honestly: tick only what you verified, and state
plainly **what was and was not verified**. `Closes #N` on the last PR of an issue,
`Refs #N` on earlier ones. Add the module owner's reviewer (never the author), assign
the author. Bind the PR in the app and read CI with the PR status tools, not by polling.

**A11 · Review loop.** Read the comments (`gh pr view N --comments`). Fix what is
right, push new commits (no force-push), answer what you decline with a reason. If CI
is red, read the failing log, fix, push.

**A12 · Merge** (only when the person says to, and only when someone **other than the
module owner** has approved and CI is green):

```bash
gh pr merge N --squash --delete-branch
git switch main && git pull
git branch -D <branch>
```

Then clean up working files and report what shipped and what is left for the next PR.

---

## B · Fix a bug

**B1 · Reproduce first.** Write the smallest **failing test** that shows the bug and
run it. Show the failure. If you cannot reproduce it, say so and ask; do not fix a bug
you have not seen.

**B2 · Find the cause, not the symptom.** Read the code and the docs for the
*intended* behaviour (ARCHITECTURE, the module's ADRs). If the intended behaviour is
ambiguous, that is a decision: ask. If the fix needs a table, column, function or role
that does not exist, propose it as a decision.

**B3 · Smallest fix.** Branch `fix/<thing>`. One concern. A bug in a **merged
migration is fixed by a new migration**, never by editing the old file. Do not refactor
around it in the same PR.

**B4 · Fix and prove.** Run the failing test: it must now pass. Then run every gate in
A6 and show the output.

**B5 · Look for siblings.** Search for the same mistake elsewhere (same pattern in
other modules or tables). Add a test where it is cheap; otherwise list them in the PR.

**B6 · Docs.** A decision record only if the fix made a non-obvious choice.
`FEATURES.md` changes only if a tick was wrong: untick it and say so.

**B7 · Commit and PR** as A9–A12. Subject `Fix …`; the PR body gives the cause, the
test that proves the fix, and what you did not verify. Use `Fixes #N`. A hotfix does
not skip a gate.

---

## C · Review someone else's PR

1. List open PRs; add the person as reviewer where missing. Skip PRs they authored.
2. Read the description, comments, CI status and the **whole diff**.
3. Check bugs and logic first, then the rules in `CLAUDE.md` and `docs/SECURITY.md`,
   then quality and improvements. Run the suites if SQL changed and it is cheap.
4. Comment on each file and line that needs a change, with the concrete fix. Say
   plainly if there is nothing; do not invent findings.
5. **Approve only if** the PR meets the standards: CI green, tests prove the claims,
   no unresolved blocking comment, docs updated, nothing unverified presented as
   verified. Otherwise request changes.
6. Say what you are about to post before posting it, and report only what the tool
   result shows was posted.

---

## D · Where it usually goes wrong

| Trap | What to do |
| :-- | :-- |
| Two branches pick the same migration version or ADR number | Check every remote branch (A2) before choosing |
| Local `pnpm` older than the repo's | `npm install -g pnpm@9.12.0`, reopen the shell; never `--force` the lockfile |
| `supabase/config.toml` contains the text `service_role` | Never stage it; Scope guard fails on it |
| `/security-review` shows an empty diff | The change is untracked or staged; commit locally first |
| Handler returns a bare `('accepted', null)` | Cast to `public.sync_result` (ADR-014) |
| A lock trigger raises a plain exception | Raise SQLSTATE `PS409` so the router answers `conflict` |
| `rejected` stub vs missing handler | `rejected` is terminal on the phone; a missing handler is retried. Prefer real bodies |
| CRLF warnings on `git add` (Windows) | Harmless |
| Test passed on first run | Suspicious: confirm it failed before the code existed, or break the code on purpose |
| A working file sits at the repo root | Never stage it; delete it after merge |

---

## E · Stop and ask when

- the work is not in `FEATURES.md`, or needs a tenth module or a fifth role;
- it needs a table, column, function or role not in `docs/ARCHITECTURE.md`;
- it reads another module's table with no published view or function;
- two valid designs differ in cost (give options, a recommendation, a short reason);
- a gate fails and the cause is not in this change;
- anything is hard to reverse or visible to others: commit, push, PR, comment, approve,
  merge, deleting a branch.
