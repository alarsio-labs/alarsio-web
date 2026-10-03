#!/usr/bin/env bash
# Runs the SQL suites in supabase/tests against a throwaway Postgres.
# Stub: no migrations exist yet. Replace with the real runner in the first module PR.
set -euo pipefail
cd "$(dirname "$0")"
shopt -s nullglob
suites=(*_test.sql)
if [ "${#suites[@]}" -eq 0 ]; then
  echo "No SQL suites yet."
  exit 0
fi
echo "Found ${#suites[@]} suite(s) but no runner is wired up." >&2
exit 1
