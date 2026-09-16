#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }
script="$PWD/spec/scripts/spec.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/lib"
cat > "$tmp/lib/accepted.md" <<'EOF'
---
id: accepted-rule
status: accepted
scope:
  - "src/**/*.ts"
verify: check:test -f "$SPEC_DIR/marker"
---
Keep the interface stable.
EOF
cat > "$tmp/lib/proposed.md" <<'EOF'
---
id: proposed-rule
status: proposed
scope:
  - "src/**/*.ts"
verify: check:false
---
Do not leak proposed rules.
EOF
touch "$tmp/lib/marker"

set +e
SPEC_DIR="$tmp/lib" bash "$script" verify >"$tmp/out"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "healthy accepted check exits 0"
grep -q '^PASS  accepted-rule$' "$tmp/out" || fail "healthy check reports PASS"
grep -q '^SKIP  proposed-rule (proposed)$' "$tmp/out" || fail "proposed entry is skipped"

rm "$tmp/lib/marker"
set +e
SPEC_DIR="$tmp/lib" bash "$script" verify >"$tmp/out"
rc=$?
set -e
[ "$rc" -eq 1 ] || fail "drift exits 1, got $rc"
grep -q '^FAIL  accepted-rule' "$tmp/out" || fail "drift reports FAIL"

set +e
SPEC_DIR="$tmp/missing" bash "$script" verify >"$tmp/out" 2>&1
rc=$?
set -e
[ "$rc" -eq 2 ] || fail "missing library exits 2, got $rc"
grep -q 'no spec library' "$tmp/out" || fail "missing library explains exit"

touch "$tmp/lib/marker"
out=$(SPEC_DIR="$tmp/lib" bash "$script" slice 'src/lib/file.ts')
printf '%s\n' "$out" | grep -q '^## spec: accepted-rule$' || fail "matching glob slices accepted entry"
! printf '%s\n' "$out" | grep -q 'proposed-rule' || fail "slice excludes proposed entry"
grep -q 'Keep the interface stable\.' <<<"$out" || fail "slice includes body"

printf 'contract tests passed\n'
