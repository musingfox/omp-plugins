#!/usr/bin/env bash
# Render a spiral decision brief with the sibling viz package when available.
set -uo pipefail
brief="${1:?usage: render-decision.sh <brief.md> <output-name>}"
name="${2:-spiral-decision}"
if [ ! -f "$brief" ]; then
  echo "[spiral] brief not found: $brief" >&2
  exit 1
fi
root="${OMP_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
render=""
for candidate in "$root/../viz/lib/render.sh" "$root/../viz"/*/lib/render.sh "$root/../../viz/lib/render.sh" "$root/../../viz"/*/lib/render.sh; do
  [ -f "$candidate" ] && render="$candidate"
done
if [ -n "$render" ]; then
  out="$(bash "$render" "$brief" "$name")"
  printf '%s\n' "$out"
  if printf '%s\n' "$out" | grep -q 'URL: http://'; then
    echo "[spiral] save-mode=browser"
  else
    echo "[spiral] save-mode=inline   # viz Save unavailable — use terminal fallback"
  fi
  exit 0
fi
echo "[spiral] viz render.sh not found — decision brief (read inline):" >&2
printf '%s\n' "----------------------------------------------------------------------" >&2
cat "$brief"
echo "[spiral] save-mode=inline   # viz absent — use terminal fallback"
