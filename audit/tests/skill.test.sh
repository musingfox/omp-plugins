#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }
frontmatter() { awk 'NR == 1 && /^---$/ { f = 1; next } f && /^---$/ { exit } f' "$1"; }

s=audit/skills/docs/SKILL.md
a=audit/agents/docs-classifier.md

frontmatter "$s" | grep -qx 'name: docs' || fail "T1 skill name"
frontmatter "$s" | grep -qx 'disable-model-invocation: true' || fail "T2 an audit is typed by hand: user-invoked"

frontmatter "$a" | grep -qx 'name: docs-classifier' || fail "T3 agent name"
frontmatter "$a" | grep -qx 'thinkingLevel: xhigh' || fail "T4 agent thinking level pinned"
if frontmatter "$a" | sed -n 's/^tools: //p' | tr ',' '\n' | tr -d ' ' | grep -qx edit; then
  fail "T5 the classifier writes only its report: no Edit"
fi
grep -Fq '`agent: docs-classifier`' "$s" || fail "T6 the skill dispatches the agent this plugin ships"

slug() { sed -E 's/^#+ //' | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9 -]//g; s/ /-/g'; }
for link in $(grep -oE '\]\(references/[^)]+\)' "$s" | sed -E 's/^\]\(//; s/\)$//'); do
  file="audit/skills/docs/${link%%#*}"
  [ -f "$file" ] || fail "T7 missing ${link%%#*}"
  case "$link" in
    *#*) grep -E '^#+ ' "$file" | slug | grep -qx "${link#*#}" || fail "T7 missing anchor #${link#*#}" ;;
  esac
done

for p in adr spec; do
  grep -Fq "the \`$p\` skill" "$s" || fail "T8 the skill routes to the \`$p\` skill"
done

if grep -rnE '(^|[^A-Za-z0-9_./:<-])/[a-z-]+:[a-z-]+' audit/skills audit/agents; then
  fail "T10 a Claude-style namespaced slash name remains; OMP does not namespace"
fi

for file in audit/skills/docs/references/*.md; do
  grep -Fq "](references/$(basename "$file")" "$s" || fail "T9 $(basename "$file") is reachable from no pointer in the skill"
done
