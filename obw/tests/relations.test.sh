#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
fixture="$root/tests/fixtures/relations"
fail(){ echo "FAIL: $*" >&2; exit 1; }
grep -q '^blocked_by:.*\[\[db-migration\]\]' "$fixture/implement-auth.md" || fail 'blocked_by wikilink fixture'
grep -q '^related:.*\[\[api-redesign\]\]' "$fixture/implement-auth.md" || fail 'related wikilink fixture'
grep -q '^parent:.*\[\[auth-epic\]\]' "$fixture/implement-auth.md" || fail 'parent wikilink fixture'
grep -q 'Cycles' "$root/skills/obw-pm/SKILL.md" || fail 'cycle safeguard'
grep -q 'dependents' "$root/skills/obw-pm/SKILL.md" || fail 'archive dependent safeguard'
echo 'relations: ok'
