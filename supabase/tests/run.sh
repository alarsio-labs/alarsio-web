#!/usr/bin/env bash
# Runs the SQL suites in supabase/tests against a throwaway Postgres in Docker.
# Applies the auth shim, every migration in order, then each *_test.sql.
set -euo pipefail
cd "$(dirname "$0")"
shopt -s nullglob
suites=(*_test.sql)
if [ "${#suites[@]}" -eq 0 ]; then
  echo "No SQL suites yet."
  exit 0
fi

name="alarsio-testdb-$$"
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=test postgres:15 >/dev/null
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT

until docker exec "$name" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; do sleep 1; done
sleep 1

psql_run() { docker exec -i "$name" psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f -; }

psql_run < support/auth_shim.sql
for m in ../migrations/*.sql; do
  echo "migrate  $(basename "$m")"
  psql_run < "$m"
done
for s in "${suites[@]}"; do
  echo "suite    $s"
  psql_run < "$s"
done
echo "All SQL suites passed."
