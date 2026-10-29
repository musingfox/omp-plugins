#!/usr/bin/env bash
set -euo pipefail
# OMP lists each skill's description in the system prompt and tells the model to
# read a matching skill, so the description carries the phrases that trigger it.
root=$(cd "$(dirname "$0")/.." && pwd)
fail(){ echo "FAIL: descriptions $*" >&2; exit 1; }
desc() { grep '^description:' "$root/skills/$1/SKILL.md"; }
has() { desc "$1" | grep -qF "$2" || fail "$1 description lacks $2"; }

for s in obw-init obw-jot obw-pm; do
  [ "$(grep -c '^description:' "$root/skills/$s/SKILL.md")" -eq 1 ] || fail "$s must have one description line"
done

for t in '"add a task"' '"archive X"' '"refresh dashboard"' '"split this spec into tickets"' 'via `/obw-pm`' 'Requires `.obsidian.yaml`'; do
  has obw-pm "$t"
done
[ "$(desc obw-pm | grep -o 'tickets' | grep -c .)" -eq 1 ] || fail 'obw-pm description must name tickets once'
grep -q '^## To Tickets' "$root/skills/obw-pm/SKILL.md" || fail 'pm lost its To Tickets section'

for t in 'via `/obw-init`' '"migrate my obw vault"' '"upgrade my obw vault"' 'reports missing config'; do
  has obw-init "$t"
done
desc obw-pm | grep -qF 'section. ADRs belong to the adr plugin.' || fail 'obw-pm description must end as cc does'
has obw-jot '"記一下 / log this to my journal / 紀錄'
if desc obw-init | grep -qi 'dashboard'; then fail 'init description names dashboards, which pm refreshes'; fi
echo 'descriptions: ok'
