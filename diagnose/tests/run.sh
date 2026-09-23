#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS="$ROOT/tests"
cd "$ROOT/.."
shopt -s nullglob
total=0
failed=0
for test_file in "$TESTS"/*.test.sh; do
  total=$((total + 1))
  name="$(basename "$test_file")"
  if bash "$test_file"; then
    printf 'ok   - %s\n' "$name"
  else
    printf 'not ok - %s\n' "$name"
    failed=$((failed + 1))
  fi
done
printf '%s\n' '---'
printf 'tests: %d, failed: %d\n' "$total" "$failed"
if [ "$failed" -eq 0 ]; then
  echo 'test_exit=0'
  exit 0
fi
echo 'test_exit=1'
exit 1
