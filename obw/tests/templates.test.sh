#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
fail(){ echo "FAIL: $*" >&2; exit 1; }

grep -q '^created: {{date}}$' "$root/templates/task.md" || fail 'task created property'
[ ! -e "$root/templates/adr.md" ] || fail 'ADRs belong to the adr plugin, not an obw template'
grep -q 'use the `adr` skill' "$root/skills/obw-pm/SKILL.md" || fail 'pm must point ADR requests at the adr skill'
grep -q "display: 'if(title, title, file.name)'" "$root/templates/dashboard-project.base" || fail 'project display formula'
grep -q 'name: "Blocked"' "$root/templates/dashboard-project.base" || fail 'blocked view'
grep -q 'name: "By Parent"' "$root/templates/dashboard-project.base" || fail 'parent view'
grep -q 'name: "Docs"' "$root/templates/dashboard-project.base" || fail 'docs view'
grep -q 'name: "All Tasks"' "$root/templates/dashboard-project.base" || fail 'all tasks view'
grep -q 'formula.display' "$root/templates/dashboard-cross.base" || fail 'cross display formula'
grep -q 'Missing template views' "$root/skills/obw-init/SKILL.md" || fail 'init view refresh rule'
grep -q 'do not overwrite a dashboard whose views already match' "$root/skills/obw-pm/SKILL.md" || fail 'pm safe refresh rule'
forbidden_root=$(printf 'CLAUDE%sPLUGIN_ROOT' '_')
forbidden_plugin=$(printf 'claude%splugin' '-')
forbidden_ask=$(printf 'AskUser%s' 'Question')
if grep -R -n -E "$forbidden_root|$forbidden_plugin|$forbidden_ask" "$root" --exclude='*.test.sh' >/dev/null; then
  fail 'Claude-only reference'
fi
echo 'templates: ok'
