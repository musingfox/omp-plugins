#!/usr/bin/env bash
# Wait for a browser Save by watching the decision brief mtime.
set -uo pipefail
brief="${1:?usage: wait-decision.sh <brief.md> [timeout_sec]}"
timeout="${2:-1800}"
interval=2
elapsed=0
if [ ! -f "$brief" ]; then
  echo "[spiral] wait-decision: brief not found: $brief" >&2
  exit 1
fi
mtime_of() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }
answers() { sed -n '2,/^---$/p' "$brief" | grep -E '^([A-Za-z0-9_-]+\.)?(choice|notes):'; }
if answers | grep -qE ':[[:space:]]*[^[:space:]]'; then answers; exit 0; fi
start="$(mtime_of "$brief")"
while [ "$elapsed" -lt "$timeout" ]; do
  now="$(mtime_of "$brief")"
  if [ -n "$now" ] && [ "$now" != "$start" ]; then
    answers || echo "[spiral] saved, but no choice/notes keys in the frontmatter"
    exit 0
  fi
  sleep "$interval"
  elapsed=$((elapsed + interval))
done
echo "[spiral] wait-decision: timeout after ${timeout}s — no Save detected." >&2
exit 2
