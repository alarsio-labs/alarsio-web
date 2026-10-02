# How we work

Everyone follows this. It is short on purpose.

## The loop: Plan → Spec → Generate → Validate

```
  PLAN            SPEC              GENERATE           VALIDATE
  ────            ────              ────────           ────────
  What and why    How, exactly      Claude writes it   Prove it works
  ↓               ↓                 ↓                  ↓
  Issue           Acceptance        Working code       Tests, review,
  created         criteria agreed   on a branch        security, PR
```

**Nothing is generated before a spec exists.** The spec is what makes the
generated code reviewable — without it, nobody can say whether the output is
right, only whether it looks plausible.

---

## The ten steps, in order

### 1 · Understand the requirement

Read the issue. Read the module's section in `docs/ARCHITECTURE.md`. Read the
relevant P0 rows in `docs/PRD.md`.

**You are done when** you can state, in one sentence and without looking:
what this feature lets a user do, and which module owns the data it touches.

If you cannot, the issue is not ready. Ask in the issue, don't guess.

### 2 · Design and think

Before Claude Code is involved, write down in the issue:

- Which tables change, and which module owns them
- Which module functions you will call (and which you must **not**)
- What a user sees when it works, and when it fails
- What could go wrong offline

**Five minutes here saves an hour of regenerating.**

### 3 · Ask Claude Code for the implementation

Start in **plan mode** (`Shift+Tab`). Give it the spec, not a vague request.

❌ "Add attendance"
✅ "Implement the attendance roster screen per issue #12. Read
   `docs/ARCHITECTURE.md` for the Attendance module's boundary first. It owns
   `attendance_days` and `attendance_entries`. It may read Workforce through
   the published wage-rate view, and must not write to any Workforce table."

Review the plan **before** approving it. If the plan names a table your module
does not own, stop there — that is cheaper than reviewing the diff.

### 4 · Inspect the generated code

Read every line. This is the step people skip, and it is the step that matters.

- Does it do what the spec said, and only that?
- Does it touch a table another module owns?
- Are there `any` types, swallowed errors, or `TODO`s left behind?
- Is RLS still on? Did anything reach for a service-role key?
- Would you have written it this way?

**If you cannot explain a line to a teammate, do not ship it.** Ask Claude to
explain it, or rewrite it yourself.

### 5 · Test

```bash
pnpm typecheck --filter=<app>
pnpm lint --filter=<app>
pnpm test --filter=<app>
pnpm test:db                    # if you touched SQL
```

Then test it **by hand**, including the unhappy path: no network, bad input,
wrong role. See `docs/TESTING.md`.

### 6 · Security review

Run `/security-review` in Claude Code, then check `docs/SECURITY.md` yourself.
The automated pass finds the obvious; the checklist finds the rest.

Never skip this on anything touching auth, RLS, worker data or money.

### 7 · Commit

Small, logical commits with a clear subject line:

```bash
git add <specific files>        # not "git add ." — read what you are staging
git commit -m "Add geofence check to site check-in"
```

Imperative mood. Say *what*, and if it is not obvious, *why* in the body.

### 8 · Open the PR

```bash
git push -u origin feat/attendance-roster
gh pr create --fill
```

Fill in the template honestly. "What I checked" is the important section — it
tells your reviewer where to look.

### 9 · Human review

**A different person reviews.** Never the module owner. This is how knowledge
spreads across four people instead of pooling in one.

As reviewer, read `docs/SECURITY.md` and the architecture rules, then ask:
does this belong in this module? Would I be able to fix this in three months?

Approve, or request changes with a reason. "Looks good" with no reading is worse
than no review.

### 10 · Merge and update the record

CI must be green. Then merge, and in the same PR or immediately after:

- Tick the feature in `docs/FEATURES.md`
- If you made a non-obvious choice, add a row to `docs/DECISIONS.md`

---

## Branches

```
feat/<module>-<thing>     feat/attendance-roster
fix/<thing>               fix/geofence-rounding
chore/<thing>             chore/add-turbo-cache
docs/<thing>              docs/update-architecture
```

Branch from `main`, keep it short-lived, rebase rather than merge `main` into it.

## Rules that CI enforces, so you don't have to argue about them

- No direct pushes to `main`
- One approving review required
- `typecheck`, `lint` and `test` must pass
- A new module in code without a row in `FEATURES.md` fails the build

## When you are stuck

1. Re-read the module's section in `docs/ARCHITECTURE.md`
2. Ask Claude to explain the existing code before changing it
3. Ask in the issue — in writing, so the answer is findable later
4. If it is a decision rather than a question, write it in `docs/DECISIONS.md`

Being stuck for twenty minutes is normal. Being stuck silently for two days is
the thing to avoid.
