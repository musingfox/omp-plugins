#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
METHOD="$ROOT/docs/method.md"
SKILL="$ROOT/skills/diagnose/SKILL.md"
COMMAND="$ROOT/commands/diagnose-now.md"

# Worktrees must be outside the repository and carry tracked edits.
grep -q 'WORK="\${TMPDIR:-/tmp}/diagnose-' "$METHOD"
grep -q 'git -C "$REPO" diff --binary HEAD | git -C "$WORK" apply' "$METHOD"
! grep -q 'WORK=.*REPO/' "$METHOD"

# Evidence-only handoff: one failing test, then the main session; no fix application.
grep -q 'Stop. The fix is the main session' "$METHOD"
grep -q '^Test: <sha>' "$METHOD"
grep -q '^Cherry-pick <sha>' "$METHOD"
grep -q 'it never applies the fix' "$METHOD"
! grep -qF '/cf' "$METHOD" "$COMMAND"

# OMP package and interaction/resource mappings; reject Claude-only contracts.
grep -q '"omp": {}' "$ROOT/package.json"
grep -q 'OMP `ask`' "$SKILL"
grep -q '\${OMP_PLUGIN_ROOT}' "$COMMAND"
! grep -R -qE 'CLAUDE_PLUGIN_ROOT|AskUserQuestion|disable-model-invocation|TaskStop|Monitor' "$ROOT/skills" "$ROOT/commands" "$ROOT/docs" "$ROOT/scripts"

printf 'diagnose contract fixtures: ok\n'
