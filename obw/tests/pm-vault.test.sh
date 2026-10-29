#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
skill="$root/skills/obw-pm/SKILL.md"
fail(){ echo "FAIL: $*" >&2; exit 1; }
grep -q 'Every CLI call passes `vault={vault}` as its first argument' "$skill" || fail 'pm must require vault= on every CLI call'
for verb in create search move read property:set delete; do
  grep -q "obsidian vault={vault} $verb" "$skill" || fail "pm must pass vault= to $verb"
done
if grep -n -E '`obsidian (create|search|move|read|property:set|delete|overwrite)' "$skill"; then
  fail 'a CLI call in pm names no vault'
fi
grep -qF '**Delete**: confirm first, then `obsidian vault={vault} delete`; it moves the note to the trash.' "$skill" || fail 'delete must confirm, then move the note to the trash'
echo 'pm-vault: ok'
