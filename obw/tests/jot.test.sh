#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
skill="$root/skills/obw-jot/SKILL.md"
fail(){ echo "FAIL: $*" >&2; exit 1; }
grep -q 'obsidian vault=<VAULT_NAME> daily:append' "$skill" || fail 'cap mode must pass vault= to daily:append'
grep -q 'obsidian vault=<VAULT_NAME> read' "$skill" || fail 'note mode must pass vault= to read'
grep -q 'obsidian vault=<VAULT_NAME> create' "$skill" || fail 'note mode must pass vault= to create'
grep -qF '→ `- 14:32 — #worklog 完成了 API-first 架構 draft`' "$skill" || fail 'cap example must keep #tag tokens in place'
echo 'jot: ok'
