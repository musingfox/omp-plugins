#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
skill="$root/skills/obw-jot/SKILL.md"
fail(){ echo "FAIL: $*" >&2; exit 1; }
grep -q 'obsidian vault=<VAULT_NAME> daily:append' "$skill" || fail 'cap mode must pass vault= to daily:append'
grep -q 'obsidian vault=<VAULT_NAME> read' "$skill" || fail 'note mode must pass vault= to read'
grep -q 'obsidian vault=<VAULT_NAME> create' "$skill" || fail 'note mode must pass vault= to create'
echo 'jot: ok'
