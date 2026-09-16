#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail() { echo "  ✗ $*"; exit 1; }

cmd=spiral/commands/spiral.md
grep -qF '.spiral/L<N>-plan.md' "$cmd" || fail 'converged decision is not persisted'
grep -qF '## Suggested skills' "$cmd" || fail 'promoted plan has a skills handoff section'
grep -qF 'durable artifact' "$cmd" || fail 'handoff does not distinguish durable artifacts'
printf 'ok - promoted-plan handoff structure\n'
