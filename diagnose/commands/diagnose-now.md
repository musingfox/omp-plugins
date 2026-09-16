---
description: "Start diagnosis immediately; leave one failing regression test and hand off to /cf"
---

# Diagnose now

Typing `/diagnose-now` is the confirmation. Create the worktree first — do not ask whether to proceed.

If the target is not a git repository, stop before attempting a worktree and say so.

Treat `$ARGUMENTS` as the symptom when present. If none was supplied and the conversation has no observed symptom either, call OMP `ask` in plain prose for what is broken. That is an input question, not permission to run.

Plugin root is this command's package directory. Set `OMP_PLUGIN_ROOT` to that directory if it is unset before resolving package resources.
Then read `${OMP_PLUGIN_ROOT}/docs/method.md` and follow it to the closing hand-off. The HITL template path is `${OMP_PLUGIN_ROOT}/scripts/hitl-loop.template.sh`.
