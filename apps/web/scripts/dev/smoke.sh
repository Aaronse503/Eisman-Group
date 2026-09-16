#!/usr/bin/env bash
# Signs in as a demo user and fetches a list of routes, reporting status codes.
set -uo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${EMAIL:-aaron@eismandigital.com}"
PASSWORD="${PASSWORD:-ChangeMe123!}"
JAR="$(mktemp)"

login=$(curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/sign-in" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -w '\n%{http_code}')
code=$(echo "$login" | tail -1)
if [ "$code" != "200" ]; then echo "LOGIN FAILED ($code): $(echo "$login" | head -1)"; exit 1; fi
echo "login ok"

fail=0
for path in "$@"; do
  status=$(curl -s -o /tmp/smoke_body -w '%{http_code}' -b "$JAR" "$BASE$path")
  if [ "$status" != "200" ]; then
    echo "  ✗ $status  $path"
    head -c 400 /tmp/smoke_body | tr -d '\n'; echo
    fail=1
  else
    echo "  ✓ $status  $path"
  fi
done
exit $fail
