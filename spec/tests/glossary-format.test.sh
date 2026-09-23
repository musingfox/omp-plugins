#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }
skill="$PWD/spec/skills/glossary/SKILL.md"
format="$PWD/spec/skills/glossary/references/context-format.md"

[ -f "$format" ] || fail 'glossary format reference exists'
grep -q '_Avoid_' "$format" || fail 'format documents avoided synonyms'
grep -q 'OMP_PLUGIN_ROOT' "$skill" || fail 'glossary resolves references from OMP plugin root'
grep -q 'context-format.md' "$skill" || fail 'glossary requires the format reference'
grep -q 'CONTEXT.md sits at the repo root' "$skill" || fail 'glossary keeps context at repository root'
printf 'glossary format behavior passed\n'
