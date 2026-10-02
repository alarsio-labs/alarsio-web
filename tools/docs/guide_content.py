# -*- coding: utf-8 -*-
"""Content of the Alarsio Team Development Guide.

    python tools/docs/design_pdf.py guide_content
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guide_diagrams import g1, g2, g3   # noqa: E402

OUT_STEM = "alarsio-team-guide"
DOC_TITLE = "Alarsio Team Development Guide"
DOC_SUBTITLE = "How we build, together"
FOOTER = "Alarsio — Team Development Guide"

COVER = {
    "eyebrow": "Team Guide · Read before your first task",
    "title": "Alarsio",
    "title_em": "Team Development Guide",
    "lede": "Four people, eight weeks, nine modules. This guide is how we turn that "
            "into a working product without stepping on each other. It covers the loop "
            "we follow for every feature, how to get real work out of Claude Code, and "
            "the rules that keep four parallel streams from colliding.",
    "stats": [
        ("4", "people", "two modules each"),
        ("9", "MVP modules", "nothing more"),
        ("8", "weeks", "foundation, capture, close"),
        ("1", "repo", "monorepo + Turborepo"),
    ],
    "toc": [
        ("Day one — get running", "02"),
        ("How we work — the loop", "03"),
        ("The ten steps, in detail", "04"),
        ("Claude Code — the essentials", "05"),
        ("Claude Code — power features", "06"),
        ("Our commands, subagents and skills", "07"),
        ("The documents that run the project", "08"),
        ("Git, PRs and review", "09"),
        ("Testing and security review", "10"),
        ("CI/CD with GitHub Actions", "11"),
        ("Who builds what, week by week", "12"),
    ],
}

# ── page 2
SETUP = [
    ("Accounts", "GitHub with 2FA on · accept the alarsio-labs invite · "
                 "Supabase free tier · Claude Code installed and signed in"),
    ("Tools", "Node 20+ · pnpm 9+ · Git · Docker Desktop · GitHub CLI"),
    ("Git identity ~critical~",
     "`git config --global user.email` must match an email on your GitHub account. "
     "Wrong email means your commits never appear on your profile or the contribution "
     "graph — and the programme is graded on that."),
    ("Clone and install",
     "`gh auth login` · `git clone` · `pnpm install` · copy `.env.example` to "
     "`apps/web/.env.local` and fill in your Supabase values"),
    ("Never commit",
     "The service-role key. Not once, not temporarily. CI fails the build if the string "
     "appears anywhere in the repo."),
    ("Read, in order",
     "`CLAUDE.md` → `docs/WORKFLOW.md` → `docs/ARCHITECTURE.md` → "
     "`docs/FEATURES.md` → `docs/IMPROVEMENTS.md`"),
    ("First contribution today",
     "Add your name to the README on a branch, open a PR, have someone else merge it. "
     "Learn the loop before it matters."),
]

# ── page 4
STEPS = [
    ("1", "Understand the requirement",
     "Read the issue, the module's section in ARCHITECTURE.md, and the P0 rows in PRD.md. "
     "You are done when you can state in one sentence what the user can now do, and which "
     "module owns the data. If you cannot, the issue is not ready — ask, don't guess."),
    ("2", "Design and think",
     "Before Claude is involved, write in the issue: which tables change and who owns them, "
     "which module functions you will call and which you must not, what the user sees when "
     "it works and when it fails, what breaks offline. Five minutes here saves an hour."),
    ("3", "Ask Claude Code to implement",
     "Start in plan mode. Give the spec, not a vague request. Review the plan before "
     "approving it — if the plan names a table your module does not own, stop there. "
     "That is far cheaper than reviewing the diff."),
    ("4", "Inspect the generated code",
     "Read every line. This is the step people skip and the step that matters. Does it do "
     "only what the spec said? Does it touch another module's tables? Any `any`, swallowed "
     "error or TODO? If you cannot explain a line to a teammate, do not ship it."),
    ("5", "Test",
     "`pnpm typecheck`, `lint`, `test`, and `test:db` if SQL changed. Then by hand, "
     "including the unhappy path: no network, bad input, wrong role."),
    ("6", "Security review",
     "Run `/security-review`, then walk `docs/SECURITY.md` yourself. The automated pass "
     "finds the obvious; the checklist finds the rest. Never skip it on auth, RLS, worker "
     "data or money."),
    ("7", "Commit",
     "Small, logical commits. `git add` specific files — read what you are staging. "
     "Imperative subject: “Add geofence check to site check-in”."),
    ("8", "Open the PR",
     "`gh pr create --fill`, then fill the template honestly. “What I checked” is "
     "the section that tells your reviewer where to look."),
    ("9", "Human review",
     "A different person reviews — never the module owner. That is how knowledge "
     "spreads across four people instead of pooling in one. “Looks good” without "
     "reading is worse than no review."),
    ("10", "Merge and update the record",
     "CI green, then merge. Tick the row in FEATURES.md. If you made a non-obvious choice, "
     "add an ADR to DECISIONS.md."),
]

# ── page 5
CC_BASICS = [
    ("Plan mode", "`Shift+Tab`",
     "Claude plans before touching anything. Use it for every task bigger than a one-line "
     "fix. Reviewing a plan costs seconds; reviewing a wrong diff costs an hour."),
    ("Project memory", "`CLAUDE.md`",
     "Read automatically at the start of every session. Our rules, stack, module owners "
     "and conventions live there. Keep it short and true — a stale CLAUDE.md actively "
     "misleads."),
    ("Clear the context", "`/clear`",
     "Start a fresh task with a clean slate. A long session drifts; old context makes Claude "
     "confident about things that changed twenty messages ago."),
    ("Security review", "`/security-review`",
     "Reviews the pending diff for vulnerabilities. Mandatory on anything touching auth, "
     "RLS, worker data or money."),
    ("Code review", "`/code-review`",
     "Reviews the current diff for correctness bugs before a human sees it."),
    ("Install the GitHub app", "`/install-github-app`",
     "Sets up the Claude GitHub Action and its secret. Run once, by a repo admin. After "
     "that, mention @claude in any issue or PR."),
    ("Initialise memory", "`/init`",
     "Generates a first CLAUDE.md by reading the codebase. Ours is already written — "
     "edit it rather than regenerating."),
]

# ── page 6
CC_POWER = [
    ("Custom slash commands", "`.claude/commands/<name>.md`",
     "A prompt you reuse, as a Markdown file with frontmatter. `$ARGUMENTS` is replaced by "
     "what you type. This is the cheapest way to make good practice the default — "
     "nobody has to remember the long prompt."),
    ("Skills", "`.claude/skills/<name>/SKILL.md`",
     "Packaged know-how Claude loads when a task matches the description. Ours holds the "
     "migration pattern and RLS rules, so a new module is written our way without anyone "
     "pasting a template."),
    ("Subagents", "`.claude/agents/<name>.md`",
     "A separate agent with its own tools and its own context window. Use for work that "
     "would otherwise flood the main conversation — reviews, sweeps, test writing. It "
     "reports back; your main session stays focused."),
    ("MCP servers", "`.mcp.json` or `claude mcp add`",
     "Connects Claude to outside systems — your Supabase project, GitHub, Sentry. "
     "Checked into the repo, so everyone gets the same connections."),
    ("Hooks", "`.claude/settings.json`",
     "Shell commands that fire on events. Example: run `pnpm lint` automatically after "
     "every file edit, so formatting is never a review comment."),
    ("Permissions", "`.claude/settings.json`",
     "Pre-approve safe commands so you are not clicking allow all day, and deny the "
     "dangerous ones outright. Ours allows pnpm and read-only git, and asks before "
     "commit, push or PR."),
]

OUR_TOOLING = [
    ("`/spec`", "command",
     "Turns an issue into a reviewable spec — module, tables touched, acceptance "
     "criteria, offline behaviour, security, tests. Writes no code. Run this first, always."),
    ("`/implement`", "command",
     "Implements an agreed spec inside its module boundary. Refuses to touch another "
     "module's tables or reference a post-MVP module."),
    ("`/review`", "command",
     "Reviews your branch as a strict reviewer: boundary violations, scope creep, RLS gaps, "
     "secrets, missing tests, stale docs."),
    ("`/ship`", "command",
     "Runs every gate — typecheck, lint, test, review, security — then prepares "
     "the commit and PR body. Stops and asks before committing."),
    ("`module-guard`", "subagent",
     "Checks a diff for module-boundary violations and reports them. Never edits. Use it "
     "after any change touching the database."),
    ("`test-writer`", "subagent",
     "Writes the missing tests, especially the negative ones — proving the wrong role "
     "gets zero rows, not just that the right one works."),
    ("`doc-keeper`", "subagent",
     "Keeps FEATURES.md, DECISIONS.md and CLAUDE.md in step with the code. Runs on Haiku, "
     "so it is cheap to call often."),
    ("`alarsio-module`", "skill",
     "Loads automatically when you create a module or add a migration. Holds our migration "
     "naming, the RLS pattern, and the checklist before a PR."),
]

# ── page 8
DOCS_TABLE = [
    ("`CLAUDE.md`", "Everyone, always", "Claude reads it automatically. Rules, stack, "
     "owners, conventions. The most important file in the repo."),
    ("`docs/PRD.md`", "Before building a feature", "What we are building and why. The P0 list."),
    ("`docs/ARCHITECTURE.md`", "Before touching the database", "Module boundaries, public "
     "surfaces, the five ways modules may talk."),
    ("`docs/FEATURES.md`", "Every PR", "Single source of scope. Who owns what, what is done. "
     "**CI fails if a migration lands without updating it.**"),
    ("`docs/DECISIONS.md`", "When you choose", "Why we picked X over Y. Never delete a "
     "decision — supersede it."),
    ("`docs/WORKFLOW.md`", "Day one, then when stuck", "The ten steps. Branch and commit "
     "conventions."),
    ("`docs/SECURITY.md`", "Every security review", "The checklist. Run it, don't skim it."),
    ("`docs/TESTING.md`", "Writing tests", "What to test where, and the manual pass before a PR."),
    ("`docs/IMPROVEMENTS.md`", "When tempted to copy v1", "The nine things we are "
     "deliberately doing differently."),
    ("`docs/ONBOARDING.md`", "Your first hour", "Setup, step by step."),
]

# ── page 9
GIT_RULES = [
    ("Branch", "`feat/<module>-<thing>` · `fix/` · `chore/` · `docs/`",
     "Branch from main, keep it short-lived, rebase rather than merging main into it."),
    ("Commit", "Imperative, one logical change",
     "“Add geofence check to site check-in”. Say what; if it is not obvious, say "
     "why in the body. Never `git add .` without reading what you staged."),
    ("PR size", "One module, one concern",
     "If a reviewer cannot hold it in their head, it is too big. Split it."),
    ("Reviewer", "Someone who does not own the module",
     "This is deliberate. It spreads knowledge and catches assumptions the owner cannot see."),
    ("Merge", "CI green, one approval, conversations resolved",
     "Enforced by branch protection, so nobody has to police it."),
]

REVIEW_ASKS = [
    "Does this do what the issue asked, and only that?",
    "Does it write to a table its module does not own?",
    "Does it reference a post-MVP module?",
    "Is RLS on every new table and view?",
    "Does a policy compare a role inline instead of calling a named predicate?",
    "Is there a test for the failure case, not only the happy path?",
    "Could I fix a bug in this in three months?",
]

# ── page 10
SEC_CHECKS = [
    ("Always", "RLS on every new table and view · named predicates, never inline role "
     "checks · no service-role key anywhere · no secret in the diff · no PII "
     "in a log line"),
    ("Data access", "A supervisor reaches only assigned sites — tested, not assumed "
     "· a supervisor cannot read wages · only an owner reopens a locked period "
     "· views are `security_invoker` · changing an id in the request cannot reach "
     "another organisation"),
    ("Input", "Validated server-side, not only in the form · no string concatenation "
     "into SQL · uploads check type and size · money and hours are range-checked"),
    ("Worker data", "Consent recorded before PII is entered · deleting removes access, "
     "never history · location captured once on an explicit tap, never in the background"),
    ("Offline", "A replayed push creates no duplicate · a device cannot overwrite an "
     "approved day · the device id is not trusted as identity"),
]

TEST_RULES = [
    ("Every PR adds a test", "or explains in the PR why it does not"),
    ("Test RLS negatively", "prove the wrong user gets zero rows"),
    ("Test every offline path", "capture offline, kill the app, reopen, sync"),
    ("Test money by hand", "a worked example calculated in the test itself"),
    ("Test every constraint", "write the statement that should fail, assert it does"),
]

# ── page 11
CI_JOBS = [
    ("`verify`", "Every PR and push to main",
     "Typecheck, lint, test, build — all through Turborepo, so only what changed is "
     "rebuilt. A red build does not get reviewed."),
    ("`scope-guard`", "Every PR",
     "Fails if a migration lands without a `FEATURES.md` update. This is exactly how scope "
     "drift got into the previous build unnoticed — now it cannot."),
    ("service-role check", "Every PR",
     "Greps the whole repo for `service_role`. Fails the build if found."),
    ("`claude.yml`", "When you mention @claude",
     "The Claude GitHub Action. Set it up once with `/install-github-app` as a repo admin, "
     "then mention @claude in any issue or PR comment and it will work on it."),
]

BRANCH_PROTECTION = [
    "Require a pull request before merging",
    "Require 1 approving review",
    "Require status checks to pass",
    "Require conversation resolution before merging",
    "No direct pushes to main — for anyone",
]

# ── page 12
OWNERSHIP = [
    ("Manish Tiwari", "Sites · Attendance & Site Presence",
     "The geofence, the roster, corrections. The heaviest field logic."),
    ("Ishant Bhoyar", "Identity & Access · Workforce",
     "Org, roles, RLS predicates everything else depends on. Build first."),
    ("Nikhil Mehta", "Offline Sync · Materials & Inventory",
     "The outbox and `sync_push`. The hardest module, and it spans the whole project."),
    ("Anuradha Tiwari", "Audit, Retention & Guards · Daily Reporting",
     "The audit trigger every module writes through, then the day's record."),
]

WEEKS = [
    ("Weeks 1–2", "Foundation — sequential",
     "Monorepo and CI green · Identity & Access (Ishant) · Sites (Manish) · "
     "Audit & Guards (Anuradha) · mobile shell and test harness (Nikhil)"),
    ("Weeks 3–6", "Field capture — parallel",
     "Workforce (Ishant) · Attendance (Manish) · Daily Reporting (Anuradha) · "
     "Materials and Offline Sync (Nikhil). These do not touch each other's tables."),
    ("Weeks 7–8", "Close the loop",
     "Wage Summaries (Ishant + Manish) · dashboard and approvals (Manish + Anuradha) "
     "· exports (Anuradha) · hardening and an offline test day (all four)"),
]

DONE = [
    "The acceptance criteria in the issue are all true",
    "`typecheck`, `lint`, `test` pass locally and in CI",
    "A test exists for the failure case, not only the happy path",
    "It works with the network off, if it is a field feature",
    "`/security-review` run and `docs/SECURITY.md` walked",
    "A different person reviewed and approved it",
    "`docs/FEATURES.md` row ticked in the same PR",
]

PAGES = [
    {
        "num": "02", "kicker": "Section 1", "title": "Day One — Get Running",
        "lead": "Under an hour, in order. The git identity step is the one that silently "
                "costs you marks if you skip it.",
        "blocks": [
            ("table", ["Step", "What to do"], SETUP, ["22%", "78%"], "s"),
            ("note", "Your first task today is a throwaway PR — add your name to the "
                     "README, open a PR, have someone else merge it. Learn the loop on "
                     "something that does not matter, before doing it on something that does."),
        ],
    },
    {
        "num": "03", "kicker": "Section 2", "title": "How We Work — The Loop",
        "lead": "Every feature goes through the same four phases. Nothing is generated "
                "before a spec exists.",
        "blocks": [
            ("diagram", g1(), "Plan → Spec → Generate → Validate", 0.95),
            ("note", "The spec is what makes generated code reviewable. Without one, nobody "
                     "can say whether the output is right — only whether it looks "
                     "plausible. That difference is the whole reason we work this way."),
        ],
    },
    {
        "num": "04", "kicker": "Section 3", "title": "The Ten Steps, In Detail",
        "lead": "This is the loop expanded. Steps 4 and 9 are the ones people skip, and they "
                "are the two that decide whether the code is any good.",
        "blocks": [("table", ["#", "Step", "What it means"], STEPS, ["5%", "22%", "73%"], "xs")],
    },
    {
        "num": "05", "kicker": "Section 4", "title": "Claude Code — The Essentials",
        "lead": "Learn these seven before anything else. They cover most of what you will do "
                "day to day.",
        "blocks": [
            ("table", ["Feature", "How", "Why it matters"], CC_BASICS, ["20%", "22%", "58%"], "s"),
            ("note", "The habit that matters most: **plan before you code**. Reviewing a plan "
                     "takes seconds. Reviewing a wrong diff takes an hour, and you will be "
                     "tempted to accept it because it is already written."),
        ],
    },
    {
        "num": "06", "kicker": "Section 5", "title": "Claude Code — Power Features",
        "lead": "These turn Claude Code from a helper into part of the team's process. All six "
                "are checked into the repo, so everyone gets them automatically.",
        "blocks": [
            ("table", ["Feature", "Where it lives", "What it is for"], CC_POWER,
             ["20%", "22%", "58%"], "s"),
            ("note", "The point of all six is the same: make the good path the easy path. "
                     "Nobody should have to remember a long prompt or a checklist — "
                     "the repo should hand it to them."),
        ],
    },
    {
        "num": "07", "kicker": "Section 6", "title": "Our Commands, Subagents and Skills",
        "lead": "Already written and committed in `.claude/`. Use them from day one — "
                "they encode the rules so you do not have to hold them in your head.",
        "blocks": [
            ("table", ["Name", "Type", "What it does"], OUR_TOOLING, ["16%", "12%", "72%"], "s"),
            ("note", "A normal feature is: `/spec` → agree it → `/implement` → "
                     "`module-guard` → `test-writer` → `/ship`. Six commands, and "
                     "the process runs itself."),
        ],
    },
    {
        "num": "08", "kicker": "Section 7", "title": "The Documents That Run The Project",
        "lead": "Ten files. Each has one job and one moment you read it. Keeping them true is "
                "part of the work, not overhead.",
        "blocks": [
            ("table", ["File", "When you read it", "What it holds"], DOCS_TABLE,
             ["22%", "20%", "58%"], "s"),
            ("note", "`FEATURES.md` is the one with teeth. CI fails any PR that adds a "
                     "migration without updating it — because undocumented scope drift "
                     "is exactly what went wrong last time."),
        ],
    },
    {
        "num": "09", "kicker": "Section 8", "title": "Git, PRs and Review",
        "lead": "Four people in one repo for eight weeks. These rules are what stop that "
                "becoming a merge problem.",
        "blocks": [
            ("twocol",
             [("h3", "The rules"),
              ("table", ["Thing", "Rule", "Why"], GIT_RULES, ["16%", "34%", "50%"], "xs")],
             [("h3", "What a reviewer asks"),
              ("rules", REVIEW_ASKS),
              ("note", "Approve, or request changes with a reason. “Looks good” "
                       "without reading is worse than no review — it creates a record "
                       "saying the code was checked when it was not.")]),
        ],
    },
    {
        "num": "10", "kicker": "Section 9", "title": "Testing and Security Review",
        "lead": "Step 5 and step 6 of the loop. Both are mandatory, and both have a checklist "
                "so they do not depend on how much you remember that day.",
        "blocks": [
            ("twocol",
             [("h3", "Security checklist"),
              ("table", ["Area", "What to check"], SEC_CHECKS, ["20%", "80%"], "xs")],
             [("h3", "Testing rules"),
              ("table", ["Rule", "Meaning"], TEST_RULES, ["40%", "60%"], "xs"),
              ("note", "Under RLS, an UPDATE with no matching policy affects zero rows and "
                       "raises nothing. A test wrapped in try/catch therefore passes "
                       "vacuously. Assert the row did not change.")]),
        ],
    },
    {
        "num": "11", "kicker": "Section 10", "title": "CI/CD with GitHub Actions",
        "lead": "CI is not paperwork. It is the thing that lets four people move fast without "
                "checking each other's work by hand.",
        "blocks": [
            ("table", ["Job", "When it runs", "What it does"], CI_JOBS, ["18%", "22%", "60%"], "s"),
            ("twocol",
             [("h3", "Branch protection on `main`"), ("rules", BRANCH_PROTECTION)],
             [("h3", "Why Turborepo matters here"),
              ("note", "Turbo caches task results and knows the dependency graph, so CI only "
                       "rebuilds what actually changed. A one-line change to the mobile app "
                       "does not rebuild the web app. As the repo grows this is the "
                       "difference between a 40-second CI and a 6-minute one.")]),
        ],
    },
    {
        "num": "12", "kicker": "Section 11", "title": "Who Builds What, Week by Week",
        "lead": "Two modules each, assigned so nobody waits on anybody. The order is set by "
                "dependencies, not preference.",
        "blocks": [
            ("diagram", g2(), "Module ownership and the eight-week shape", 0.92),
            ("twocol",
             [("h3", "Ownership"),
              ("table", ["Person", "Modules", "Note"], OWNERSHIP, ["22%", "30%", "48%"], "xs")],
             [("h3", "Definition of done"), ("rules", DONE)]),
        ],
    },
]
