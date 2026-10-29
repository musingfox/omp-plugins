#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
skill="$root/skills/obw-pm/SKILL.md"
fail(){ echo "FAIL: pm-rules $*" >&2; exit 1; }
rules=$(awk '/^## Important Rules/{f=1;next} f && /^## /{exit} f' "$skill")
[ -n "$rules" ] || fail 'pm has no Important Rules section'
rule() { printf '%s\n' "$rules" | grep -qF "$1" || fail "missing rule: $1"; }
rule '1. Read `.obsidian.yaml` before any operation.'
rule '2. Never `search` to locate a note whose name is known'
rule 'The only exceptions belong to `/obw-init`, which lists them under Filesystem Access.'
rule '4. Confirm destructive intents (delete, archive move) before executing.'
rule 'the CLI'"'"'s own success output counts; an error output never does. Report failures as failures.'
# OMP's read-only task agents (scout) have no bash, so they cannot run the obsidian CLI: no delegation rule.
n=$(printf '%s\n' "$rules" | grep -ciE 'subagent|explore|scout' || true)
[ "$n" -eq 0 ] || fail 'a rule delegates vault scans to an agent that cannot run the CLI'
echo 'pm-rules: ok'
