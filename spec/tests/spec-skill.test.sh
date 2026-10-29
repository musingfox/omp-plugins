#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=spec/skills/spec/SKILL.md

n=$(grep -c '^## Propose an entry$' "$skill" || true)
[ "$n" -eq 1 ] || fail "T1: ## Propose an entry once, got $n"

range=$(awk '/^## verify/{p=1} p && /^## / && !/^## verify/{exit} p' "$skill")
for p in 'it must go red' 'git checkout' 'git restore' 'uncommitted changes'; do
  n=$(printf '%s\n' "$range" | grep -cF "$p" || true)
  [ "$n" -ge 1 ] || fail "T2: verify section must state '$p'"
done
n=$(printf '%s\n' "$range" | grep -cF 'reverse Edit' || true)
[ "$n" -eq 0 ] || fail "T2: scratch edit must name the OMP edit tool, not Edit"

n=$(printf '%s\n' "$range" | grep -cF 'reported as debt' || true)
[ "$n" -ge 1 ] || fail "T3: test: must be reported as debt"
n=$(grep -cF '`test:` > `check:`' "$skill" || true)
[ "$n" -eq 0 ] || fail "T3: test: must not outrank check:"

n=$(printf '%s\n' "$range" | grep -cF 'verdicts come from a file' || true)
[ "$n" -ge 1 ] || fail "T4: verdict-from-a-file example missing"

n=$(grep -cF 'reviewer-cannot-edit' "$skill" || true)
[ "$n" -ge 1 ] || fail "T5: repo-neutral example id missing"
for p in 'judge-seats-cannot-edit' 'main accepts' 'The entries already in' 'Existing entries run'; do
  n=$(grep -cF "$p" "$skill" || true)
  [ "$n" -eq 0 ] || fail "T5: repo-specific '$p' must be absent"
done
