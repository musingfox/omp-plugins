#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
METHOD="$ROOT/docs/method.md"
fail() { printf 'diagnose lifecycle contract: %s\n' "$1" >&2; exit 1; }
section() { awk -v heading="$1" '$0 == heading {on=1; next} /^## / && on {exit} on' "$METHOD"; }

phase0="$(section '## Phase 0: Open a throwaway worktree')"
teardown="$(section '### Teardown (every exit path)')"
phase1="$(section '## Phase 1: Build a feedback loop')"
cleanup="$(section '## Phase 6: Cleanup')"
handoff="$(section '## Hand-off')"
redact="$(section '## Redact')"

# Worktree isolation carries tracked edits without nesting a checkout in the repo.
grep -qF 'WORK="${TMPDIR:-/tmp}/diagnose-' <<<"$phase0" || fail 'worktree is not outside the repository temp root'
grep -qF 'git rev-parse --path-format=absolute --git-common-dir' <<<"$phase0" || fail 'exclude path is not absolute'
grep -qF 'git -C "$REPO" worktree add -b diagnose/<slug> "$WORK" HEAD' <<<"$phase0" || fail 'worktree creation contract missing'
grep -qF 'git -C "$REPO" diff --binary HEAD | git -C "$WORK" apply' <<<"$phase0" || fail 'tracked edits are not carried'
grep -qF 'git -C "$REPO" ls-files --others --exclude-standard' <<<"$phase0" || fail 'untracked files are not disclosed'
grep -qF 'append `-2`, `-3`, …' <<<"$phase0" || fail 'collision-safe branch/path naming missing'

# A loop must be red-capable, deterministic, fast, and runnable without an agent.
grep -qF 'Completion criterion: a tight loop that goes red' <<<"$phase1" || fail 'loop completion criterion missing'
grep -qF 'Red-capable' <<<"$phase1" || fail 'loop does not require the exact symptom'
grep -qF 'Deterministic' <<<"$phase1" || fail 'loop determinism requirement missing'
grep -qF 'Fast' <<<"$phase1" || fail 'loop speed requirement missing'
grep -qF 'Agent-runnable' <<<"$phase1" || fail 'loop unattended execution requirement missing'
grep -qF 'already run at least once' <<<"$phase1" || fail 'loop evidence requirement missing'

# Both success and early-stop paths remove the worktree; early-stop removes its branch second.
grep -qF 'Every exit path removes the worktree' <<<"$teardown" || fail 'universal teardown missing'
grep -qF 'git -C <the literal repo path> worktree remove --force <the literal worktree path>' <<<"$teardown" || fail 'forced worktree removal missing'
grep -qF 'worktree remove --force' <<<"$teardown" || fail 'early-stop does not remove worktree'
grep -qF 'branch -D' <<<"$teardown" || fail 'early-stop does not delete branch'
grep -qF '`worktree add` never succeeded' <<<"$teardown" || fail 'failed worktree creation path is unspecified'

# Cleanup gates the hand-off artifact and excludes debug residue.
grep -qF 'Stage only the test (or repro) paths.' <<<"$cleanup" || fail 'cleanup stages more than evidence'
grep -qF '`git show <sha>` carries no `[DEBUG-` tag.' <<<"$cleanup" || fail 'debug instrumentation cleanup missing'
grep -qF 'The commit adds that artifact and nothing else.' <<<"$cleanup" || fail 'commit scope is not constrained'
grep -qF 'confirmed cause is stated in the commit message' <<<"$cleanup" || fail 'cause provenance is not committed'

# Redaction keeps credentials in the environment and refuses to overclaim from sanitized output.
grep -qF 'Redact every secret first' <<<"$redact" || fail 'secret redaction requirement missing'
grep -qF 'Build loops against env vars' <<<"$redact" || fail 'credential environment boundary missing'
grep -qF 'Captured artifacts carry auth headers' <<<"$redact" || fail 'auth-header artifact warning missing'
grep -qF 'say so and ask the user' <<<"$redact" || fail 'insufficient redacted evidence path missing'
# Handoff is emitted only after the commit and names branch, evidence, cause, repair, and patch.
grep -qF 'Print the hand-off only once the commit exists.' <<<"$handoff" || fail 'handoff timing is not gated on commit'
grep -qF 'Branch: diagnose/<slug>' <<<"$handoff" || fail 'branch handoff field missing'
grep -qF 'Test: <sha>' <<<"$handoff" || fail 'test handoff field missing'
grep -qF 'Cause: <confirmed cause>' <<<"$handoff" || fail 'cause handoff field missing'
grep -qF '/cf Cherry-pick <sha> from diagnose/<slug>' <<<"$handoff" || fail 'repair handoff missing'
grep -qF 'Patch: .diagnose/<slug>.patch' <<<"$handoff" || fail 'patch handoff field missing'


printf 'diagnose lifecycle contracts: ok\n'
