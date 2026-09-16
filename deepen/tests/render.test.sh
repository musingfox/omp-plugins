#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail() { echo "FAIL: $*" >&2; exit 1; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
report="$t/report.md"
printf '# survey\n' > "$report"
out="$(OMP_PLUGIN_ROOT="$t/deepen" bash deepen/scripts/render-survey.sh "$report" 2>&1)"
printf '%s\n' "$out" | grep -qF '# survey' || fail 'inline fallback omitted report'
printf '%s\n' "$out" | grep -qF '[deepen] render=inline' || fail 'inline fallback marker missing'
echo 'ok - render fallback'
