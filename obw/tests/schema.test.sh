#!/usr/bin/env bash
set -euo pipefail
# The task and doc schemas live in three places: the pm skill's Schema, the
# templates README's required fields and the templates themselves. They name the same fields.
# Ported from cc-plugins b4555826 obsidian-workspace/tests/schema.test.sh, without
# its plugin README leg and its session / ## Agent asserts.
root=$(cd "$(dirname "$0")/.." && pwd)
fail(){ echo "FAIL: schema $*" >&2; exit 1; }

# fields: the backticked field names on stdin, with the "(…)" value lists dropped.
fields() { sed 's/([^)]*)//g' | grep -oE '`[a-z_]+' | tr -d '`' | sort -u | paste -sd, -; }
# frontmatter FILE [EXTRA]: the template's frontmatter keys, plus EXTRA.
frontmatter() { { awk '/^---$/{n++; next} n==1' "$1" | sed -n 's/^\([a-z_]*\):.*/\1/p'; [ -z "${2:-}" ] || echo "$2"; } | sort -u | paste -sd, -; }

skill="$root/skills/obw-pm/SKILL.md"
readme="$root/templates/README.md"

skill_task=$(grep '^Task:' "$skill" | fields)
readme_task=$(grep '^- Tasks:' "$readme" | fields)
# `completed` is set on archive, so the template leaves it out.
template_task=$(frontmatter "$root/templates/task.md" completed)
[ -n "$skill_task" ] || fail 'pm skill has no Task: schema line'
[ "$skill_task" = "$readme_task" ] || fail "pm Task fields [$skill_task] != templates README [$readme_task]"
[ "$skill_task" = "$template_task" ] || fail "pm Task fields [$skill_task] != task.md [$template_task]"

skill_doc=$(grep '^Doc:' "$skill" | fields)
readme_doc=$(grep '^- Docs:' "$readme" | fields)
template_doc=$(frontmatter "$root/templates/doc.md")
[ -n "$skill_doc" ] || fail 'pm skill has no Doc: schema line'
[ "$skill_doc" = "$readme_doc" ] || fail "pm Doc fields [$skill_doc] != templates README [$readme_doc]"
[ "$skill_doc" = "$template_doc" ] || fail "pm Doc fields [$skill_doc] != doc.md [$template_doc]"
echo 'schema: ok'
