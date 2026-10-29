#!/usr/bin/env bash
set -euo pipefail
# The frontier is one search, not a dashboard view.
# Ported from cc-plugins b4555826 obsidian-workspace/tests/frontier.test.sh; the
# query lives in the pm skill's Frontier section here, not in a to-tickets reference.
root=$(cd "$(dirname "$0")/.." && pwd)
fail(){ echo "FAIL: frontier $*" >&2; exit 1; }
sec=$(awk '/^## Frontier/{f=1;next} f && /^## /{exit} f' "$root/skills/obw-pm/SKILL.md")

n=$(printf '%s\n' "$sec" | grep -cF -- '-[status:done] -[blocked_by:\"[[\"]" format=json' || true)
[ "$n" -eq 1 ] || fail "T1: frontier query once, got $n"

n=$(printf '%s\n' "$sec" | grep -c 'wikilink' || true)
[ "$n" -ge 1 ] || fail 'T3: wikilink precondition missing'

n=$(find "$root/templates" -mindepth 1 -maxdepth 1 -not -name '.*' | grep -c . || true)
[ "$n" -eq 5 ] || fail "T4: templates count 5, got $n"

n=$(grep -c 'Ready' "$root/templates/dashboard-project.base" || true)
[ "$n" -eq 0 ] || fail 'T5: Ready view must not be added'
echo 'frontier: ok'
