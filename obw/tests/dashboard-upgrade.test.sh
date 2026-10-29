#!/usr/bin/env bash
set -euo pipefail
# One copy of the dashboard refresh flow, in the pm skill; init only points to it.
# Ported from cc-plugins b4555826 obsidian-workspace/tests/dashboard-upgrade.test.sh.
# Left out: T3 (no references/old-layouts.md here), T5 (Claude Mod hooks), T8 (init
# step 5 runs no commands to order), the plugin README asserts, and T6/T7, which
# init.test.sh covers.
root=$(cd "$(dirname "$0")/.." && pwd)
fail(){ echo "FAIL: dashboard-upgrade $*" >&2; exit 1; }
init="$root/skills/obw-init/SKILL.md"
pm="$root/skills/obw-pm/SKILL.md"

step6=$(awk '/^6\. \*\*/{f=1} /^7\. \*\*/{exit} f' "$init")
n=$(printf '%s\n' "$step6" | grep -cF '/obw-pm refresh dashboard' || true)
[ "$n" -eq 1 ] || fail "T1: init step 6 /obw-pm refresh dashboard count is $n, want 1"
n=$(grep -cE 'read path=|grep .\^    name:' "$init" || true)
[ "$n" -eq 0 ] || fail "T1: init still carries a dashboard comparison, got $n"

n=$(grep -cF 'predates the Blocked / By Parent / Docs' "$init" || true)
[ "$n" -eq 0 ] || fail 'T2: pre-0.9 Blocked phrase still present'
n=$(grep -cF 'Migrate a pre-0.9 project' "$init" || true)
[ "$n" -eq 0 ] || fail 'T2: Migrate a pre-0.9 project still present'

dash=$(awk '/^## Dashboards/{f=1} /^## Important Rules/{exit} f' "$pm")
n=$(printf '%s\n' "$dash" | grep -c 'refresh dashboard' || true)
[ "$n" -ge 1 ] || fail "pm Dashboards refresh dashboard count is $n, want >=1"
n=$(printf '%s\n' "$dash" | grep -cF 'read path="pm/{project}/dashboard.base"' || true)
[ "$n" -eq 1 ] || fail "pm Dashboards read path count is $n, want 1"
n=$(printf '%s\n' "$dash" | grep -c 'hand edits' || true)
[ "$n" -ge 1 ] || fail "pm Dashboards hand edits count is $n, want >=1"
n=$(printf '%s\n' "$dash" | grep -cF 'scripts/dashboard-diff.py" project {project}' || true)
[ "$n" -eq 1 ] || fail "pm Dashboards compare command count is $n, want 1"
for v in 'verdict: missing' 'verdict: current' 'verdict: stale' 'verdict: edited'; do
  n=$(printf '%s\n' "$dash" | grep -cF "\`$v" || true)
  [ "$n" -eq 1 ] || fail "pm Dashboards must act on \`$v\` once, got $n"
done
n=$(printf '%s\n' "$dash" | grep -cF 'Conversation-mode status searches summarize without writing dashboards.' || true)
[ "$n" -eq 1 ] || fail "pm Dashboards conversation-mode status sentence count is $n, want 1"

n=$(grep -cF 'templates/dashboard-project.base")" overwrite' "$pm" || true)
[ "$n" -eq 1 ] || fail "pm dashboard-project overwrite count is $n, want 1"
n=$(cat "$init" "$pm" | grep -cF "grep '^    name:'" || true)
[ "$n" -eq 0 ] || fail "a skill still compares view names only, got $n"

# base:views ignores path= and lists the views of whichever base is open in Obsidian.
n=$(cat "$root"/skills/*/SKILL.md | grep -cE 'base:views[^`]*path=' || true)
[ "$n" -eq 0 ] || fail "T4: a skill runs base:views with path=, got $n"
echo 'dashboard-upgrade: ok'
