#!/usr/bin/env bash
# Checks to run before a commit or push, and only the gates the changed files need.
#
#   pnpm preflight
#
# Rules (any failure stops before the gates run):
#   - not on main
#   - no forbidden file staged or committed on the branch: supabase/config.toml, .env*
#     (except .env.example) and working drafts in the repo root
#   - a changed migration needs docs/FEATURES.md in the same diff
#     (PREFLIGHT_NO_FEATURE_TICK=1 overrides it, with a warning)
#   - a new migration has a unique version, newer than the newest on origin/main
#   - no `service_role` in a tracked file under apps, packages or supabase
#   - docs/DECISIONS-INDEX.md has one line per ADR in docs/DECISIONS.md, same status
# CI's scope-guard job checks the migration and service_role rules; the rest are local only.
set -uo pipefail
cd "$(dirname "$0")/.."

fails=()
warns=()
fail() { fails+=("$1"); }

# ---- branch and base ---------------------------------------------------------
branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  fail "On '$branch'. Work on a branch: feat/<module>-<thing>, fix/<thing>, chore/<thing> or docs/<thing>."
fi

if ! git fetch origin main --quiet 2>/dev/null; then
  warns+=("WARN: could not fetch origin/main; the checks use the last fetched copy.")
fi
base=HEAD
if git rev-parse --verify -q origin/main >/dev/null; then
  base="$(git merge-base origin/main HEAD)"
else
  warns+=("WARN: no origin/main to compare with; migration checks are skipped.")
fi

# Committed on the branch plus staged, never a file that was deleted.
in_diff="$( { git diff --name-only --diff-filter=d --cached; git diff --name-only --diff-filter=d "$base" HEAD; } | sort -u)"
# Everything that differs from the base, including unstaged and new unstaged files.
changed="$( { git diff --name-only --diff-filter=d "$base"; git diff --name-only --diff-filter=d --cached; git ls-files --others --exclude-standard; } | sort -u)"

# ---- forbidden files ---------------------------------------------------------
is_forbidden() {
  case "$1" in
    supabase/config.toml) return 0 ;;
    .env.example | */.env.example) return 1 ;;
    .env | .env.* | */.env | */.env.*) return 0 ;;
  esac
  case "$1" in */*) return 1 ;; esac # working drafts live in the root only
  case "$1" in
    spec-*.md | pr*-*.md | *-pr-body.md | *-commit-message.txt | *-comment*.md | pr-review-drafts*.md) return 0 ;;
  esac
  return 1
}
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if is_forbidden "$f"; then
    fail "Forbidden file in the diff: $f (never commit it; unstage it with: git restore --staged $f)"
  fi
done <<<"$in_diff"

# ---- migrations --------------------------------------------------------------
migs="$(grep '^supabase/migrations/' <<<"$changed" || true)"
if [ -n "$migs" ]; then
  if ! grep -qx 'docs/FEATURES.md' <<<"$changed"; then
    if [ "${PREFLIGHT_NO_FEATURE_TICK:-}" = "1" ]; then
      warns+=("WARN: a migration changed without docs/FEATURES.md; allowed by PREFLIGHT_NO_FEATURE_TICK=1. CI will still ask for it.")
    else
      fail "A migration changed but docs/FEATURES.md did not. Tick the row, or set PREFLIGHT_NO_FEATURE_TICK=1 if none applies."
    fi
  fi

  if git rev-parse --verify -q origin/main >/dev/null; then
    main_migs="$(git ls-tree --name-only origin/main supabase/migrations/ | sed 's|.*/||')"
    newest="$(sed 's/_.*//' <<<"$main_migs" | sort | tail -n 1)"
    while IFS= read -r m; do
      [ -f "$m" ] || continue
      b="$(basename "$m")"
      grep -qxF "$b" <<<"$main_migs" && continue # already on origin/main, not new
      v="${b%%_*}"
      count="$(find supabase/migrations -maxdepth 1 -name "${v}_*.sql" | wc -l | tr -d ' ')"
      if [ "$count" -gt 1 ]; then
        fail "Migration version $v is used by $count files. Pick a version no other migration uses."
      fi
      if ! [[ "$v" > "$newest" ]]; then
        fail "Migration $b (version $v) is not newer than the newest on origin/main ($newest). Rename it."
      fi
    done <<<"$migs"
  fi
fi

# ---- service role ------------------------------------------------------------
hits="$(git grep -I -l 'service_role' -- apps packages supabase 2>/dev/null || true)"
if [ -n "$hits" ]; then
  fail "service_role found in a tracked file (it must never enter this repo): $(tr '\n' ' ' <<<"$hits")"
fi

# ---- decision index ----------------------------------------------------------
if [ ! -f docs/DECISIONS-INDEX.md ]; then
  fail "docs/DECISIONS-INDEX.md is missing."
else
  heads="$(awk '/^## ADR-[0-9][0-9][0-9] /{n=$2; getline; s="?"; if (match($0,/Status:\*\* [A-Za-z]+/)) s=substr($0,RSTART+10,RLENGTH-10); print n, s}' docs/DECISIONS.md | sort)"
  idx="$(awk -F'|' '/^\| ADR-[0-9][0-9][0-9] /{n=$2; s=$4; gsub(/ /,"",n); gsub(/ /,"",s); print n, s}' docs/DECISIONS-INDEX.md | sort)"
  if [ "$heads" != "$idx" ]; then
    diffs="$(comm -3 <(echo "$heads") <(echo "$idx") | tr -s '\t' ' ' | tr '\n' ';')"
    fail "docs/DECISIONS-INDEX.md differs from docs/DECISIONS.md (number status): $diffs"
  fi
fi

# ---- report rules ------------------------------------------------------------
for w in "${warns[@]+"${warns[@]}"}"; do [ -n "$w" ] && echo "$w"; done
if [ "${#fails[@]}" -gt 0 ]; then
  for f in "${fails[@]}"; do echo "FAIL: $f"; done
  echo
  echo "Ran: rules only. Skipped: every gate, because a rule failed."
  exit 1
fi
echo "Rules: ok"

# ---- pick the gates ----------------------------------------------------------
all=0 web=0 mobile=0 alldb=0 scripts=0
suites=()
while IFS= read -r f; do
  case "$f" in
    apps/web/*) web=1 ;;
    apps/mobile/*) mobile=1 ;;
    packages/* | package.json | pnpm-lock.yaml | pnpm-workspace.yaml | turbo.json) all=1 ;;
    supabase/tests/*_test.sql) suites+=("$(basename "$f" _test.sql)") ;;
    supabase/migrations/* | supabase/tests/*) alldb=1 ;;
    scripts/*) scripts=1 ;;
  esac
done <<<"$changed"

ran=()
skipped=()
gate_failed=0
gate() {
  [ "$gate_failed" -eq 0 ] || { skipped+=("$* (an earlier gate failed)"); return; }
  echo "-> $*"
  if "$@"; then ran+=("$* (passed)"); else ran+=("$* (FAILED)"); gate_failed=1; fi
}
ts_gates() { # optional turbo filter
  gate pnpm typecheck "$@"
  gate pnpm lint "$@"
  gate pnpm test "$@"
}

if [ "$all" -eq 1 ]; then
  ts_gates
  skipped+=("per-app TypeScript gates (covered by the full run)")
else
  if [ "$web" -eq 1 ]; then ts_gates --filter=web; else skipped+=("web gates (no apps/web change)"); fi
  if [ "$mobile" -eq 1 ]; then ts_gates --filter=mobile; else skipped+=("mobile gates (no apps/mobile change)"); fi
fi
if [ "$alldb" -eq 1 ]; then
  gate pnpm test:db
elif [ "${#suites[@]}" -gt 0 ]; then
  gate pnpm test:db "${suites[@]}"
else
  skipped+=("SQL suites (no supabase/migrations or supabase/tests change)")
fi
if [ "$scripts" -eq 1 ] && [ -f scripts/preflight.test.sh ]; then
  gate bash scripts/preflight.test.sh
fi
skipped+=("/review, /security-review, module-guard and doc-keeper (run them yourself; preflight does not)")

echo
if [ "${#ran[@]}" -eq 0 ]; then
  echo "Ran: none, no gates needed for these changes."
else
  echo "Ran:"
  for g in "${ran[@]}"; do echo "  $g"; done
fi
echo "Skipped:"
for g in "${skipped[@]}"; do echo "  $g"; done
[ "$gate_failed" -eq 0 ]
