#!/usr/bin/env bash
# Serves the app for the end-to-end suite against a database of its own, so a
# developer's own data is never touched.
#
# Set E2E_DATABASE_URL to a scratch Postgres and the suite runs against that,
# which is what a CI run should do. Without it the embedded database is used,
# which is convenient but has a real limitation: it allows one process per data
# directory, and a Next server can serve requests from more than one. A long
# run can therefore damage it, and the tests will start failing in ways that
# look like application faults but are not. Use a real Postgres for anything
# beyond a quick check.
set -euo pipefail
cd "$(dirname "$0")/../.."

export AUTH_SECRET="${AUTH_SECRET:-e2e-only-secret-key-at-least-32-characters}"
export DEMO_MODE=true
# The suite signs in dozens of times from one address; the limiter would
# otherwise start refusing part-way through a run.
export LOGIN_ATTEMPTS_PER_IP=500
export LOGIN_ATTEMPTS_PER_EMAIL=200
PORT="${E2E_PORT:-3100}"

if [ -n "${E2E_DATABASE_URL:-}" ]; then
  export DATABASE_URL="$E2E_DATABASE_URL"
  echo "Using the Postgres at E2E_DATABASE_URL."

  # The suite needs an empty schema, and seeding twice into the same one fails
  # on the unique constraints. Dropping a schema is not something to do by
  # accident, so the database has to be named for the purpose — or the caller
  # has to say plainly that wiping it is intended.
  DB_NAME="${E2E_DATABASE_URL##*/}"
  DB_NAME="${DB_NAME%%\?*}"
  if [[ "$DB_NAME" == *e2e* || "$DB_NAME" == *test* || "${E2E_ALLOW_RESET:-}" == "true" ]]; then
    echo "Resetting the schema in $DB_NAME."
    psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 -q \
      -c 'drop schema if exists app cascade;' \
      -c 'drop schema if exists public cascade;' \
      -c 'create schema public;'
  else
    echo "Refusing to reset '$DB_NAME': name it *e2e* or *test*, or set E2E_ALLOW_RESET=true." >&2
    exit 1
  fi
else
  export PGLITE_DATA_DIR="${PGLITE_DATA_DIR:-.data/e2e-pglite}"
  echo "Using the embedded database at $PGLITE_DATA_DIR."
  echo "Set E2E_DATABASE_URL to a scratch Postgres for a reliable full run."

  # Never delete the data directory while another process still has it open:
  # pulling the files out from under a live server corrupts the instance.
  if [ -f "${PGLITE_DATA_DIR}.lock" ]; then
    HOLDER="$(cat "${PGLITE_DATA_DIR}.lock" 2>/dev/null || true)"
    if [ -n "$HOLDER" ] && kill -0 "$HOLDER" 2>/dev/null; then
      echo "The end-to-end database is already open in process $HOLDER." >&2
      echo "Stop it first:  kill $HOLDER" >&2
      exit 1
    fi
  fi
  rm -rf "$PGLITE_DATA_DIR" "${PGLITE_DATA_DIR}.lock"
fi

npx tsx scripts/seed.ts
npx tsx scripts/dev/e2e-prepare.ts

if [ ! -d .next ]; then
  echo "No build found; building first."
  npx next build
fi
exec npx next start -p "$PORT"
