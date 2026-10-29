#!/usr/bin/env bash
# Every agent definition carries frontmatter the host reads: its name matches its
# file, it sets thinkingLevel (an `effort:` key is ignored, not read), and it pins
# no model, because model roles differ per install.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"

AGENTS="$(cd "$METHOD_TESTS_DIR/../agents" && pwd)"
fm() { awk 'NR == 1 && /^---$/ {on=1; next} on && /^---$/ {exit} on' "$1"; }

n=0
for f in "$AGENTS"/*.md; do
  n=$((n + 1))
  base="$(basename "$f" .md)"
  head="$(fm "$f")"
  assert_eq "name: $base" "$(grep -m1 '^name:' <<<"$head")" "$base: name matches the file"
  assert_contains "$head" "omp: task" "$base: omp: task"
  assert_eq "1" "$(grep -cE '^thinkingLevel: (minimal|low|medium|high|xhigh|max)$' <<<"$head" | tr -d ' ')" "$base: one valid thinkingLevel"
  assert_eq "" "$(grep -E '^(effort|model|color):' <<<"$head" || true)" "$base: no effort, model or color key"
  assert_eq "" "$(grep -m1 '^tools:' <<<"$head" | grep -E '[A-Z]' || true)" "$base: tool names are lowercase"
done
assert_eq "4" "$n" "four agent definitions"
