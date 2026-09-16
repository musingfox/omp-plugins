#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
fixture="$root/tests/fixtures/migration"
fail(){ echo "FAIL: $*" >&2; exit 1; }
[ -d "$fixture/pm/demo/archive" ] || fail 'legacy archive fixture'
[ -f "$fixture/pm/demo/tasks/legacy-task.md" ] || fail 'legacy task fixture'
grep -q 'rmdir' "$root/skills/obw-init/SKILL.md" || fail 'safe archive cleanup'
grep -q 'never filesystem `mv`' "$root/skills/obw-init/SKILL.md" || fail 'link-preserving move'
grep -q 'Missing `title`' "$root/skills/obw-init/SKILL.md" || fail 'title migration'
echo 'migration: ok'
