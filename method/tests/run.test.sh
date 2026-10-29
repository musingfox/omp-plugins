#!/usr/bin/env bash
# Self-validation for the test harness itself (run.sh + lib/assert.sh).
# Discovered and executed by run.sh like any other *.test.sh.

. "$METHOD_TESTS_DIR/lib/assert.sh"

# Positive cases.
assert_eq "abc" "abc" "assert_eq matches equal strings"
assert_contains "hello world" "world" "assert_contains finds substring"
assert_exit 0 true "assert_exit captures success"
assert_exit 1 false "assert_exit captures failure"

# assert_json round-trips a real jq read.
tmp="$(mktemp)"
printf '{"status":"PASS","n":3}' > "$tmp"
assert_json "$tmp" '.status' "PASS" "assert_json reads a string field"
assert_json "$tmp" '.n' "3" "assert_json reads a numeric field"
rm -f "$tmp"

# Meta: a failing assertion must make a test file exit nonzero.
assert_exit 1 bash -c ". \"$METHOD_TESTS_DIR/lib/assert.sh\"; assert_eq 1 2" \
  "a failing assertion yields nonzero exit"

# Meta: a clean test file must exit zero.
assert_exit 0 bash -c ". \"$METHOD_TESTS_DIR/lib/assert.sh\"; assert_eq ok ok" \
  "a passing assertion yields zero exit"

# The scrub drops the caller's METHOD_* variables before a test file runs.
sandbox="$(mktemp -d)"
mkdir -p "$sandbox/tests/lib"
cp "$METHOD_TESTS_DIR/run.sh" "$sandbox/tests/run.sh"
cp "$METHOD_TESTS_DIR/lib/assert.sh" "$sandbox/tests/lib/assert.sh"
printf '%s\n' '#!/usr/bin/env bash' '[ -z "${METHOD_LEAK:-}" ] || exit 2' > "$sandbox/tests/probe.test.sh"
out="$(METHOD_LEAK=1 bash "$sandbox/tests/run.sh" 2>&1)"
assert_contains "$out" "ok   - probe.test.sh" "the scrub drops a caller's METHOD_* variable"
rm -rf "$sandbox"

