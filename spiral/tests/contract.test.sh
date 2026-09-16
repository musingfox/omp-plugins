#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail() { echo "  ✗ $*"; exit 1; }

[ -f spiral/package.json ] || fail 'package metadata missing'
grep -q '"omp": {}' spiral/package.json || fail 'package is not an OMP envelope'
grep -q 'omp: true' spiral/commands/spiral.md || fail 'command lacks OMP marker'
grep -qF '${OMP_PLUGIN_ROOT}/agents/divergence.md' spiral/commands/spiral.md || fail 'divergence contract is not loaded'
grep -qF '${OMP_PLUGIN_ROOT}/agents/probe.md' spiral/commands/spiral.md || fail 'probe contract is not loaded'
grep -qF '${OMP_PLUGIN_ROOT}/agents/prototype.md' spiral/commands/spiral.md || fail 'prototype contract is not loaded'
grep -qF 'completion handle and `hub wait`' spiral/commands/spiral.md || fail 'single-worker dispatches do not join'
grep -qF 'completion handle; reissue `hub wait`' spiral/commands/spiral.md || fail 'probe batch does not join'
grep -qF 'through **hub**' spiral/commands/spiral.md || fail 'wait lifecycle lacks hub primitive'
grep -q '`ask`' spiral/commands/spiral.md || fail 'decision flow lacks ask primitive'
grep -q 'worktree add -b' spiral/agents/prototype.md || fail 'prototype does not create an external worktree'
grep -q 'worktree remove --force' spiral/agents/prototype.md || fail 'prototype does not clean its worktree'
grep -q 'git show.*verdict.md' spiral/agents/prototype.md || fail 'prototype verdict is not branch-addressable'
[ -x spiral/scripts/render-decision.sh ] || fail 'renderer is not executable'
[ -x spiral/scripts/wait-decision.sh ] || fail 'waiter is not executable'
printf 'ok - OMP envelope and decision/prototype lifecycle\n'
