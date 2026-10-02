---
description: Implement an agreed spec, inside its module boundary
argument-hint: <issue number or spec reference>
---

Implement: $ARGUMENTS

Before writing code:
- Read `CLAUDE.md` and `docs/ARCHITECTURE.md`.
- Confirm the spec exists and has been agreed. If it has not, run `/spec` instead.

Rules you must not break:
- Write **only** to tables the owning module owns. To change another module's
  data, call that module's published function.
- Do **not** reference any post-MVP module (Approvals, Procurement, BOQ, Sales,
  Notifications, Punch List). They do not exist.
- RLS stays on. No service-role key. No `any` types.
- One module, one concern. If the work spans two modules, stop and tell me.

Work in this order:
1. Database migration, if any — new file, never edit a merged one.
2. RLS policies, using named predicates.
3. Types in `packages/types`.
4. Server logic.
5. UI.
6. Tests, including the negative cases.

After each file, say in one line what it does and why it is in that module.

Do not commit. Do not push. Stop when the code is written and tests pass, and
summarise what I should check by hand.
