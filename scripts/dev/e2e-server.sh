#!/usr/bin/env bash
# Serves the app for the end-to-end suite against a throwaway database, so a
# developer's own data is never touched.
#
# This serves the production build rather than the development server. The
# development server compiles routes in more than one process, and the embedded
# database allows exactly one process per data directory, so a heavy run can
# damage it. The production build is also what a real deployment runs.
set -euo pipefail
cd "$(dirname "$0")/../.."

export PGLITE_DATA_DIR="${PGLITE_DATA_DIR:-.data/e2e-pglite}"
export AUTH_SECRET="${AUTH_SECRET:-e2e-only-secret-key-at-least-32-characters}"
export DEMO_MODE=true
# The suite signs in dozens of times from one address; the limiter would
# otherwise start refusing part-way through a run.
export LOGIN_ATTEMPTS_PER_IP=500
export LOGIN_ATTEMPTS_PER_EMAIL=200
PORT="${E2E_PORT:-3100}"

# Never delete the data directory while another process still has it open:
# PGlite is single-process, and pulling the files out from under a live server
# corrupts the instance.
if [ -f "${PGLITE_DATA_DIR}.lock" ]; then
  HOLDER="$(cat "${PGLITE_DATA_DIR}.lock" 2>/dev/null || true)"
  if [ -n "$HOLDER" ] && kill -0 "$HOLDER" 2>/dev/null; then
    echo "The end-to-end database is already open in process $HOLDER." >&2
    echo "Stop it first:  kill $HOLDER" >&2
    exit 1
  fi
fi
rm -rf "$PGLITE_DATA_DIR" "${PGLITE_DATA_DIR}.lock"
npx tsx scripts/seed.ts
npx tsx scripts/dev/e2e-prepare.ts
if [ ! -d .next ]; then
  echo "No build found; building first."
  npx next build
fi
exec npx next start -p "$PORT"
