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
render_version=""
version_gt() {
  awk -v left="$1" -v right="$2" '
    function normal(value, parts, count) {
      sub(/^v/, "", value)
      count = split(value, parts, ".")
      return (parts[1] + 0) "." (parts[2] + 0) "." (parts[3] + 0)
    }
    BEGIN {
      split(normal(left), a, ".")
      split(normal(right), b, ".")
      for (i = 1; i <= 3; i++) {
        if ((a[i] + 0) != (b[i] + 0)) {
          print ((a[i] + 0) > (b[i] + 0) ? "1" : "0")
          exit
        }
      }
      print "0"
    }
  '
}
for candidate in "$root/../viz/lib/render.sh" "$root"/../viz/*/lib/render.sh "$root/../../viz/lib/render.sh" "$root"/../../viz/*/lib/render.sh; do
  [ -f "$candidate" ] || continue
  candidate_dir="$(dirname "$(dirname "$candidate")")"
  candidate_version="$(basename "$candidate_dir")"
  [ "$candidate_version" = "viz" ] && candidate_version="0.0.0"
  if [ -z "$render" ] || [ "$(version_gt "$candidate_version" "$render_version")" = "1" ]; then
    render="$candidate"
    render_version="$candidate_version"
  fi
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
