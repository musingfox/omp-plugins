#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail() { echo "FAIL: $*" >&2; exit 1; }
explorer=deepen/agents/explorer.md
skill=deepen/skills/survey/SKILL.md
for heading in '## Summary' '## Friction' '## Notes'; do grep -qF "$heading" "$explorer" || fail "missing $heading"; done
grep -qF 'Report path:' "$explorer" || fail 'report envelope missing'
grep -qF 'Scope:' "$explorer" || fail 'scope envelope missing'
grep -qF 'task' "$skill" || fail 'task dispatch missing'
grep -qF 'isolated' "$skill" || fail 'isolated dispatch missing'
grep -qF 'more than three' "$skill" || fail 'three-task cap missing'
grep -qF 'use `read` to retrieve' "$skill" || fail 'report aggregation does not use read'
grep -qF '## Top recommendation' deepen/docs/report.md || fail 'report output missing'
for forbidden in "CLAUDE""_PLUGIN_ROOT" "AskUser""Question" "Agent""("; do
  if grep -R -nF "$forbidden" deepen >/dev/null; then fail 'Claude-only syntax found'; fi
done
echo 'ok - task envelope and report contract'
