#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
fixture="$root/tests/fixtures/publish"
fail(){ echo "FAIL: $*" >&2; exit 1; }
grep -q '^title: Implement Auth API$' "$fixture/ticket-preview.txt" || fail 'preview title'
grep -q '^Blocked by: db-migration$' "$fixture/ticket-preview.txt" || fail 'preview edge'
grep -q 'preview' "$root/skills/obw-pm/SKILL.md" || fail 'preview gate'
grep -q 'publish' "$root/skills/obw-pm/SKILL.md" || fail 'publish gate'
grep -q 'Publish blockers first' "$root/skills/obw-pm/SKILL.md" || fail 'blocker-first publishing'
grep -q 'never retry' "$root/skills/obw-pm/SKILL.md" || fail 'create failure safeguard'
echo 'publish: ok'
