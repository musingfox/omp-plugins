#!/usr/bin/env bash
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/.."
total=0 failed=0
for f in "$root"/tests/*.test.sh; do
  total=$((total + 1)); if bash "$f"; then echo "ok   - $(basename "$f")"; else echo "not ok - $(basename "$f")"; failed=$((failed + 1)); fi
done
echo "tests: $total, failed: $failed"
if [ "$failed" -eq 0 ]; then echo test_exit=0; exit 0; else echo test_exit=1; exit 1; fi
