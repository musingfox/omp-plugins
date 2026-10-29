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
grep -qF 'docs/decisions/' "$skill" || fail 'decisions directory not read'
grep -qF 'docs/adr/' "$skill" || fail 'adr directory not read'
grep -qF 'design vocabulary' deepen/docs/report.md || fail 'report does not say design vocabulary'
if grep -qiF 'glossary' deepen/docs/report.md; then fail 'report says glossary'; fi
for t in locality leverage interface depth seam adapter module; do
  [ "$(grep -c "^- \*\*$t\*\*:" deepen/docs/report.md)" -eq 1 ] || fail "report lacks one definition of $t"
done
grep -qF '(8ba6f0a)' deepen/scripts/hotspots.sh || fail 'hotspot threshold rationale missing'
grep -qF '"upstream": "b4555826"' deepen/package.json || fail 'upstream not recorded'
echo 'ok - task envelope and report contract'
