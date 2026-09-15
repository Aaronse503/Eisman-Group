#!/usr/bin/env bash
# Starts `next dev` fully detached so it survives the calling shell, and waits
# until it answers. PGlite allows one process per data directory, so never run a
# db:* script while this is up.
set -uo pipefail
cd "$(dirname "$0")/../.."
if curl -s -o /dev/null --max-time 2 http://localhost:3000/login; then
  echo "already running"; exit 0
fi
rm -f .data/pglite.lock
mkdir -p .data
setsid nohup npm run dev > .data/dev.log 2>&1 < /dev/null &
disown || true
for _ in $(seq 1 60); do
  sleep 1
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/login; then echo "ready"; exit 0; fi
done
echo "server did not become ready"; tail -20 .data/dev.log; exit 1
