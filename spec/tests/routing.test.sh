#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }
script="$PWD/spec/scripts/spec.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/lib"
cat > "$tmp/lib/routed.md" <<'EOF'
---
id: routed-rule
status: accepted
scope:
  - "src/**/*.ts"
verify: null
---
Route this constraint.
EOF
cat > "$tmp/lib/other.md" <<'EOF'
---
id: other-rule
status: accepted
scope:
  - "docs/**/*.md"
verify: null
---
Do not route this constraint.
EOF

out=$(SPEC_DIR="$tmp/lib" bash "$script" slice src/lib/file.ts)
printf '%s\n' "$out" | grep -q '^## spec: routed-rule$' || fail 'matching scope is routed'
! printf '%s\n' "$out" | grep -q 'other-rule' || fail 'non-matching scope is excluded'

out=$(SPEC_DIR="$tmp/lib" bash "$script" slice docs/guides/guide.md)
printf '%s\n' "$out" | grep -q '^## spec: other-rule$' || fail 'second scope is routed'
! printf '%s\n' "$out" | grep -q 'routed-rule' || fail 'first scope is excluded'

printf 'routing behavior passed\n'
