#!/usr/bin/env bash
# Tests for scripts/preflight.sh. Each case builds a throwaway git repo (with a bare
# "origin") in a temp directory, copies the real script into it and runs it. A stub
# `pnpm` on the PATH records the commands the script would run, so no gate really runs.
#
#   bash scripts/preflight.test.sh
set -uo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'cd "$SRC" && rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat >"$TMP/bin/pnpm" <<'STUB'
#!/usr/bin/env bash
echo "pnpm $*" >>"$PNPM_LOG"
STUB
chmod +x "$TMP/bin/pnpm"
export PNPM_LOG="$TMP/pnpm.log"
export PATH="$TMP/bin:$PATH"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

passed=0
failed=0
R=""

# A repo on feat/x, one commit behind nothing: main holds docs, one migration, and an
# index that matches DECISIONS.md. origin is a bare repo next to it.
mkrepo() {
  R="$TMP/repo-$((passed + failed))"
  rm -rf "$R" "$R.git"
  git init -q --bare "$R.git"
  git init -q -b main "$R"
  cd "$R" || exit 1
  git remote add origin "$R.git"
  mkdir -p docs supabase/migrations supabase/tests scripts apps/web apps/mobile packages/types
  cp "$SRC/preflight.sh" scripts/preflight.sh 2>/dev/null || echo '#!/usr/bin/env bash' >scripts/preflight.sh
  printf '.next/\nnode_modules/\n.env.local\n!.env.example\n' >.gitignore
  cat >docs/DECISIONS.md <<'EOF'
# Decision log

## ADR-001 · Monorepo
**Date:** 2026-10-02 · **Status:** Accepted · **By:** team

## ADR-002 · Supabase
**Date:** 2026-10-02 · **Status:** Proposed · **By:** team

## ADR-00N · Short title
**Date:** · **Status:** Proposed
EOF
  cat >docs/DECISIONS-INDEX.md <<'EOF'
# Decision index

| ADR | Title | Status | Module |
| :-- | :-- | :-- | :-- |
| ADR-001 | Monorepo | Accepted | Platform |
| ADR-002 | Supabase | Proposed | Platform |
EOF
  echo '- [ ] a feature' >docs/FEATURES.md
  echo 'select 1;' >supabase/migrations/20260101000000_a.sql
  echo 'x' >supabase/tests/foo_test.sql
  echo 'x' >docs/PLAYBOOK.md
  echo '{}' >apps/web/package.json
  echo '{}' >apps/mobile/package.json
  echo '{}' >packages/types/package.json
  git add -A
  git commit -q -m init
  git push -q origin main
  git checkout -q -b feat/x
  : >"$PNPM_LOG"
}

OUT=""
CODE=0
run() {
  OUT="$(bash scripts/preflight.sh 2>&1)"
  CODE=$?
}

ok() { passed=$((passed + 1)); echo "ok    $1"; }
bad() { failed=$((failed + 1)); echo "FAIL  $1"; echo "      $2"; echo "$OUT" | sed 's/^/      | /'; }

expect_fail() { # name, substring that must appear in the output
  if [ "$CODE" -ne 0 ] && grep -qF -- "$2" <<<"$OUT"; then ok "$1"; else bad "$1" "expected non-zero exit and '$2' (exit $CODE)"; fi
}
expect_pass() {
  if [ "$CODE" -eq 0 ]; then ok "$1"; else bad "$1" "expected exit 0, got $CODE"; fi
}
expect_out() { # name, substring that must appear in the output
  if grep -qF -- "$2" <<<"$OUT"; then ok "$1"; else bad "$1" "expected '$2' in the output"; fi
}
expect_log() { # name, line that must be in the pnpm log
  if grep -qxF -- "$2" "$PNPM_LOG"; then ok "$1"; else bad "$1" "expected '$2' in pnpm log: $(tr '\n' ';' <"$PNPM_LOG")"; fi
}
expect_no_log() { # name, substring that must not be in the pnpm log
  if grep -qF -- "$2" "$PNPM_LOG"; then bad "$1" "'$2' must not be in pnpm log: $(tr '\n' ';' <"$PNPM_LOG")"; else ok "$1"; fi
}

# ---- branch ----------------------------------------------------------------
mkrepo; git checkout -q main; run
expect_fail "fails on main" "main"

mkrepo; run
expect_pass "passes on a feature branch with no changes"

# ---- forbidden staged files -------------------------------------------------
mkrepo; echo 'service_role = "x"' >supabase/config.toml; git add -f supabase/config.toml; run
expect_fail "fails with supabase/config.toml staged" "supabase/config.toml"

mkrepo; echo 'K=1' >.env.local; git add -f .env.local; run
expect_fail "fails with .env.local staged" ".env.local"

mkrepo; echo 'K=' >.env.example; git add .env.example; run
expect_pass "allows .env.example staged"

for f in spec-78-x.md pr1-pr-body.md pr2-issue-comment.md pr-review-drafts.md pr1-commit-message.txt; do
  mkrepo; echo d >"$f"; git add "$f"; run
  expect_fail "fails with draft $f staged" "$f"
done

mkrepo; echo d >spec-78-x.md; git add spec-78-x.md; git commit -q -m draft; run
expect_fail "fails with a draft already committed on the branch" "spec-78-x.md"

mkrepo; echo d >spec-78-x.md; run
expect_pass "ignores an untracked, unstaged draft"

# ---- migration rules --------------------------------------------------------
mkrepo; echo 'select 2;' >supabase/migrations/20260201000000_b.sql; git add -A; run
expect_fail "fails: migration without FEATURES.md" "FEATURES.md"

mkrepo; echo 'select 2;' >supabase/migrations/20260201000000_b.sql; echo '- [x] done' >>docs/FEATURES.md; git add -A; run
expect_pass "passes: migration with FEATURES.md"

mkrepo; echo 'select 2;' >supabase/migrations/20260201000000_b.sql; git add -A; PREFLIGHT_NO_FEATURE_TICK=1 run
expect_pass "override lets a migration through without FEATURES.md"
expect_out "override prints a warning" "PREFLIGHT_NO_FEATURE_TICK"

mkrepo; echo 'select 2;' >supabase/migrations/20260101000000_dup.sql; echo '- [x]' >>docs/FEATURES.md; git add -A; run
expect_fail "fails: migration version used twice" "20260101000000"

mkrepo; echo 'select 2;' >supabase/migrations/20251231000000_old.sql; echo '- [x]' >>docs/FEATURES.md; git add -A; run
expect_fail "fails: migration not newer than origin/main" "newer"

mkrepo; echo 'select 2;' >supabase/migrations/20260201000000_b.sql; echo '- [x]' >>docs/FEATURES.md; run
expect_pass "sees a new migration that is not staged yet"
expect_log "an unstaged migration runs every SQL suite" "pnpm test:db"

# ---- service_role -----------------------------------------------------------
mkrepo; echo 'const k = "service_role";' >apps/web/x.ts; git add apps/web/x.ts; run
expect_fail "fails: service_role in a tracked file under apps" "service_role"

mkrepo; mkdir -p apps/web/.next; echo 'service_role' >apps/web/.next/x.js; run
expect_pass "ignores service_role in ignored .next output"

mkrepo; echo 'service_role = "x"' >supabase/config.toml; run
expect_pass "ignores service_role in an untracked supabase/config.toml"

# ---- index ------------------------------------------------------------------
mkrepo; sed -i '/ADR-002/d' docs/DECISIONS-INDEX.md; run
expect_fail "fails: ADR missing from the index" "ADR-002"

mkrepo; echo '| ADR-003 | Extra | Proposed | Platform |' >>docs/DECISIONS-INDEX.md; run
expect_fail "fails: index line with no ADR" "ADR-003"

mkrepo; sed -i 's/| ADR-002 | Supabase | Proposed/| ADR-002 | Supabase | Accepted/' docs/DECISIONS-INDEX.md; run
expect_fail "fails: index status differs from DECISIONS.md" "ADR-002"

mkrepo; rm docs/DECISIONS-INDEX.md; run
expect_fail "fails: index file missing" "DECISIONS-INDEX"

# ---- gates ------------------------------------------------------------------
mkrepo; echo 'more' >>docs/PLAYBOOK.md; run
expect_pass "docs-only diff passes"
expect_out "docs-only diff says no gates ran" "no gates"
[ -s "$PNPM_LOG" ] && bad "docs-only diff runs no pnpm" "pnpm was called" || ok "docs-only diff runs no pnpm"

mkrepo; echo 'x' >>apps/web/package.json; run
expect_log "web change runs typecheck for web" "pnpm typecheck --filter=web"
expect_log "web change runs lint for web" "pnpm lint --filter=web"
expect_log "web change runs test for web" "pnpm test --filter=web"
expect_no_log "web change does not touch mobile" "--filter=mobile"
expect_no_log "web change does not run the SQL suites" "test:db"

mkrepo; echo 'x' >>apps/mobile/package.json; run
expect_log "mobile change runs typecheck for mobile" "pnpm typecheck --filter=mobile"
expect_no_log "mobile change does not touch web" "--filter=web"

mkrepo; echo 'x' >>packages/types/package.json; run
expect_log "packages change runs typecheck everywhere" "pnpm typecheck"
expect_no_log "packages change is not filtered" "--filter"

mkrepo; echo 'y' >>supabase/tests/foo_test.sql; run
expect_log "a changed suite runs only that suite" "pnpm test:db foo"

mkrepo; echo 'x' >>apps/web/package.json; run
expect_out "output lists what ran" "Ran:"
expect_out "output lists what was skipped" "Skipped:"

mkrepo; echo 'service_role' >apps/web/x.ts; git add apps/web/x.ts; run
[ -s "$PNPM_LOG" ] && bad "no gate runs while a rule fails" "pnpm was called" || ok "no gate runs while a rule fails"

# ---- offline ----------------------------------------------------------------
mkrepo; git remote set-url origin "$TMP/does-not-exist.git"; run
expect_pass "an unreachable origin is a warning, not a failure"
expect_out "an unreachable origin is reported" "WARN"

echo
echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
