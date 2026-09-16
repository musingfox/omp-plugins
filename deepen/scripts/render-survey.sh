#!/usr/bin/env bash
# Render a survey through the sibling viz plugin, with an inline fallback.
set -euo pipefail
report="${1:?usage: render-survey.sh <report.md> [output-name]}"
name="${2:-deepen-survey}"
if [ ! -f "$report" ]; then
  echo "[deepen] report not found: $report" >&2
  exit 1
fi
report="$(cd "$(dirname "$report")" && pwd)/$(basename "$report")"
root="${OMP_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
render=""
for candidate in "$root/../viz/lib/render.sh" "$root"/../viz/*/lib/render.sh "$root/../../viz/lib/render.sh" "$root"/../../viz/*/lib/render.sh; do
  [ -f "$candidate" ] && render="$candidate"
done
inline() {
  echo "[deepen] $1 — report at: $report" >&2
  cat "$report"
  echo "[deepen] render=inline"
  exit 0
}
if [ -n "$render" ] && [ -f "$render" ]; then
  set +e
  out="$(bash "$render" "$report" "$name")"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] && { printf '%s\n' "$out"; echo '[deepen] render=viz'; exit 0; }
  inline 'viz render failed'
fi
inline 'viz render.sh not found'
