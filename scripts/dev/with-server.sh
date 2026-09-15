#!/usr/bin/env bash
# Starts the dev server (if not already running), waits for it, runs the given
# command, and leaves the server up. PGlite allows one process at a time, so
# never run a db:* script while this server is running.
set -uo pipefail
cd "$(dirname "$0")/../.."
if ! curl -s -o /dev/null --max-time 2 http://localhost:3000/login; then
  rm -f .data/pglite.lock
  (setsid npm run dev > .data/dev.log 2>&1 < /dev/null &)
  for _ in $(seq 1 40); do
    sleep 1
    curl -s -o /dev/null --max-time 2 http://localhost:3000/login && break
  done
fi
"$@"
