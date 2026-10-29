#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
init="$root/skills/obw-init/SKILL.md"
fail(){ echo "FAIL: init $*" >&2; exit 1; }
step() { awk -v n="$1" '$0 ~ "^"n"\\. \\*\\*"{f=1;print;next} f && /^[0-9]+\. \*\*/{exit} f' "$init"; }

# Keep-config path: a declined overwrite still bootstraps, but never rewrites the config.
step 1 | grep -qF 'resolve `$VAULT_PATH` from the `obsidian.json` entry' || fail 'keep-config path must resolve VAULT_PATH from obsidian.json'
step 1 | grep -qF '**keep-config** path' || fail 'step 1 must name the keep-config path'
step 7 | grep -qF 'On the keep-config path, skip this step: never write `.obsidian.yaml`' || fail 'step 7 must skip on the keep-config path'
step 8 | grep -qF 'On the keep-config path, skip the question if `.gitignore` already lists it' || fail 'step 8 must not re-ask on the keep-config path'
grep -qF '`.obsidian.yaml kept (vault=<NAME>, project=<PROJ>).`' "$init" || fail 'keep-config confirmation must say kept'
echo 'init: ok'
