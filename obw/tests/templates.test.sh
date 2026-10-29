#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
fail(){ echo "FAIL: $*" >&2; exit 1; }

grep -q '^created: {{date}}$' "$root/templates/task.md" || fail 'task created property'
[ ! -e "$root/templates/adr.md" ] || fail 'ADRs belong to the adr plugin, not an obw template'
grep -q 'use the `adr` skill' "$root/skills/obw-pm/SKILL.md" || fail 'pm must point ADR requests at the adr skill'
grep -q "display: 'file.asLink(if(title, title, file.name))'" "$root/templates/dashboard-project.base" || fail 'project display formula links the card'
grep -q "display: 'file.asLink(if(title, title, file.name))'" "$root/templates/dashboard-cross.base" || fail 'cross display formula links the card'
grep -q 'name: "Blocked"' "$root/templates/dashboard-project.base" || fail 'blocked view'
grep -q 'name: "By Parent"' "$root/templates/dashboard-project.base" || fail 'parent view'
grep -q 'name: "Docs"' "$root/templates/dashboard-project.base" || fail 'docs view'
grep -q 'name: "All Tasks"' "$root/templates/dashboard-project.base" || fail 'all tasks view'
grep -q 'formula.display' "$root/templates/dashboard-cross.base" || fail 'cross display formula'
grep -q '/obw-pm refresh dashboard' "$root/skills/obw-init/SKILL.md" || fail 'init leaves dashboard refresh to pm'
grep -q 'scripts/dashboard-diff.py" project {project}' "$root/skills/obw-pm/SKILL.md" || fail 'pm refresh compares with dashboard-diff.py'
grep -q 'regenerate only after the user agrees' "$root/skills/obw-pm/SKILL.md" || fail 'pm safe refresh rule'
forbidden_root=$(printf 'CLAUDE%sPLUGIN_ROOT' '_')
forbidden_plugin=$(printf 'claude%splugin' '-')
forbidden_ask=$(printf 'AskUser%s' 'Question')
if grep -R -n -E "$forbidden_root|$forbidden_plugin|$forbidden_ask" "$root" --exclude='*.test.sh' >/dev/null; then
  fail 'Claude-only reference'
fi
echo 'templates: ok'
