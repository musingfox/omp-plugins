#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }
tmp=$(mktemp -d "$PWD/spec/.runner-contract.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/tests"
cp spec/tests/run.sh "$tmp/tests/run.sh"
cat > "$tmp/tests/first.test.sh" <<'EOF'
#!/usr/bin/env bash
printf 'first passed\n'
EOF
cat > "$tmp/tests/second.test.sh" <<'EOF'
#!/usr/bin/env bash
printf 'second passed\n'
EOF
chmod +x "$tmp/tests"/*.test.sh "$tmp/tests/run.sh"

out=$(bash "$tmp/tests/run.sh")
printf '%s\n' "$out" | grep -q '^ok   - first.test.sh$' || fail 'runner reports first passing test'
printf '%s\n' "$out" | grep -q '^ok   - second.test.sh$' || fail 'runner reports second passing test'
printf '%s\n' "$out" | grep -q '^tests: 2, failed: 0$' || fail 'runner reports aggregate counts'
printf '%s\n' "$out" | grep -q '^test_exit=0$' || fail 'runner exits with passing verdict'

cat > "$tmp/tests/second.test.sh" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
set +e
out=$(bash "$tmp/tests/run.sh")
rc=$?
set -e
[ "$rc" -eq 1 ] || fail "runner returns failure status, got $rc"
printf '%s\n' "$out" | grep -q '^not ok - second.test.sh$' || fail 'runner reports failing test'
printf '%s\n' "$out" | grep -q '^test_exit=1$' || fail 'runner reports failing aggregate verdict'
printf 'runner behavior passed\n'
