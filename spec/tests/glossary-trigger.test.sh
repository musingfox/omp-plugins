#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=spec/skills/glossary/SKILL.md
desc=$(awk '/^description:/{p=1; next} p && /^[a-z]+:|^---$/{exit} p' "$skill" | tr -s ' \n' ' ')

for p in 'when the user asks to define or name a domain term' 'one name per concept'; do
  printf '%s\n' "$desc" | grep -qF "$p" || fail "description must say '$p'"
done

grep -qF 'Whether a decision deserves an ADR is for the adr skill to judge.' "$skill" \
  || fail "glossary must leave the ADR judgement to the adr skill in plain words"
