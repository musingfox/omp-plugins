---
name: diagnose
description: >-
  Find the confirmed cause of a bug in a throwaway worktree and hand back a branch with one failing test, without applying the fix. Use when the user asks to diagnose or root-cause a bug, not for a quick fix.
---

# Diagnose

Plugin root is this skill's package directory. Set `OMP_PLUGIN_ROOT` to that directory if it is unset before resolving package resources.

Offer the diagnosis loop, then wait. Use OMP `ask` before any worktree exists.

If there is no observed symptom, ask for it first. Do not open a worktree against a guess.

Call `ask` — "Run the full diagnosis loop? It works in its own worktree and hands back a branch with a failing test; it does not apply the fix."

- **Diagnose** — proceed. Read `${OMP_PLUGIN_ROOT}/docs/method.md` and follow it to the hand-off. The HITL template path the method asks for is `${OMP_PLUGIN_ROOT}/scripts/hitl-loop.template.sh`.
- **Just look** — answer from reading only. No worktree, no branch. Say plainly that no branch was produced.
