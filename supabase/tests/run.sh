#!/usr/bin/env bash
# Runs the SQL suites in supabase/tests against a throwaway Postgres in Docker.
# Applies the auth and storage shims, every migration in order, then each *_test.sql.
#
#   pnpm test:db                    every suite
#   pnpm test:db sync_push sites    only these suites (sync_push_test.sql, sites_test.sql)
#
# Every migration is applied either way, since a suite needs the whole schema.
# Exits non-zero and names the file when the shim or a migration fails to apply,
# a suite fails an assertion, or a suite does not load. Suites use the helpers
# in support/auth_shim.sql (test_as, test_as_anon, test_assert), not pgTAP.
set -euo pipefail
cd "$(dirname "$0")"
shopt -s nullglob

# On GitHub Actions an ::error:: line becomes an annotation on the run.
fail() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::SQL suites: $1 failed"; fi
  echo "FAILED   $1" >&2
  exit 1
}

if [ "$#" -gt 0 ]; then
  suites=()
  for arg in "$@"; do
    base="$(basename "$arg" .sql)"
    suite="${base%_test}_test.sql"
    if [ ! -f "$suite" ]; then
      echo "No suite named '$arg' (looked for supabase/tests/$suite)." >&2
      exit 2
    fi
    suites+=("$suite")
  done
else
  suites=(*_test.sql)
fi

if [ "${#suites[@]}" -eq 0 ]; then
  echo "No SQL suites yet."
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and try again." >&2
  exit 1
fi

name="alarsio-testdb-$$"
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=test postgres:15 >/dev/null
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
  || fail "postgres start (not ready after 60 seconds)"
sleep 1

psql_run() { docker exec -i "$name" psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f -; }

psql_run < support/auth_shim.sql    || fail "auth shim"
psql_run < support/storage_shim.sql || fail "storage shim"
for m in ../migrations/*.sql; do
  echo "migrate  $(basename "$m")"
  psql_run < "$m" || fail "migration $(basename "$m")"
done
for s in "${suites[@]}"; do
  echo "suite    $s"
  psql_run < "$s" || fail "suite $s"
done
echo "All SQL suites passed (${#suites[@]})."
