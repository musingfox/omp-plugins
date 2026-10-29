#!/usr/bin/env bash
# Self-test for the method skill's own files: the contracts.json template must
# pass check-contracts.sh, and every file a method file names beside it exists.

set -uo pipefail

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$HERE/../skills/method"
SCRIPT="$HERE/../scripts/check-contracts.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The ```json block of contracts.md, copied as a node would.
awk '/^```json/{p=1;next} /^```/{p=0} p' "$SKILL_DIR/contracts.md" >"$TMP/template.json"
out="$(bash "$SCRIPT" "$TMP/template.json" 2>"$TMP/err")"; rc=$?
err="$(cat "$TMP/err")"
if [ "$rc" -eq 0 ] && [ -z "$out" ] && [ -z "$err" ]; then
  ok "contracts.md template passes check-contracts.sh (exit 0, stdout and stderr empty)"
else
  bad "contracts.md template (exit $rc want 0; stdout '$out'; stderr '$err')"
fi

# Every `<name>.md` the skill files cite in backticks is a file beside them.
missing=""
for ref in $(grep -oh '`[a-z-]*\.md`' "$SKILL_DIR"/*.md | tr -d '`' | sort -u); do
  [ -f "$SKILL_DIR/$ref" ] || missing="$missing $ref"
done
if [ -z "$missing" ]; then
  ok "every method file the skill cites exists"
else
  bad "skill cites missing files:$missing"
fi

# Every agent a skill file dispatches by name has a definition.
missing=""
for seat in $(grep -oh '`method-[a-z]*`' "$SKILL_DIR"/*.md | tr -d '`' | sort -u); do
  [ -f "$HERE/../agents/$seat.md" ] || missing="$missing $seat"
done
if [ -z "$missing" ]; then
  ok "every dispatched seat has an agent definition"
else
  bad "seats without a definition:$missing"
fi

echo "pass: $PASS, fail: $FAIL"
[ "$FAIL" -eq 0 ]
