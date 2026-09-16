#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
fixture="$root/tests/fixtures/warrant"
fail(){ echo "FAIL: $*" >&2; exit 1; }
grep -q '^hard_to_reverse: true$' "$fixture/decision.yml" || fail 'reversibility fixture'
grep -q '^confusing_without_context: true$' "$fixture/decision.yml" || fail 'context fixture'
grep -q '^real_tradeoff: true$' "$fixture/decision.yml" || fail 'tradeoff fixture'
grep -q 'Hard to reverse' "$root/skills/obw-pm/SKILL.md" || fail 'condition 1'
grep -q 'Confusing without context' "$root/skills/obw-pm/SKILL.md" || fail 'condition 2'
grep -q 'Real trade-off' "$root/skills/obw-pm/SKILL.md" || fail 'condition 3'
grep -q 'plain doc' "$root/skills/obw-pm/SKILL.md" || fail 'doc redirect'
grep -q 'spec' "$root/skills/obw-pm/SKILL.md" || fail 'spec redirect'
echo 'warrant: ok'
