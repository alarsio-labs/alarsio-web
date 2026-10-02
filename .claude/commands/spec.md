---
description: Turn an issue into a reviewable implementation spec before any code
argument-hint: <issue number or feature description>
---

Write an implementation spec for: $ARGUMENTS

Do NOT write any code yet. Produce only the spec.

Steps:
1. Read `docs/ARCHITECTURE.md` and find which module owns this work.
2. Read `docs/FEATURES.md` and confirm this is in the MVP. If it is not, stop and
   say so — do not propose it anyway.
3. Read the relevant P0 rows in `docs/PRD.md`.
4. Look at how the owning module is already structured in this repo.

Then output exactly these sections:

**Module** — which one owns this, and who owns that module.

**Tables touched** — every table, marked `owns` or `reads`. If it reads a table
another module owns, name the published function or view it will go through.

**Public surface** — any new function or view this module will publish.

**Acceptance criteria** — a numbered, testable list. Each line must be something
a reviewer can verify as true or false. No "works well" or "is fast".

**Offline behaviour** — what happens with no network, and what the user sees.

**Security** — which roles may do this, and which must not. Name the RLS predicate.

**Tests to write** — including the negative ones.

**Out of scope** — what this PR will deliberately not do.

End by asking me to confirm the spec before you implement anything.
