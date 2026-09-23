---
name: hook-guard
description: >-
  Safely set up, inspect, or update project hooks and pre-commit checks, while
  requiring explicit confirmation before git or jj commits.
---

# Hook Guard

Dispatch by intent:

- **Setup**: first installation or “set up/configure hooks”.
- **Doctor**: inspect an existing setup or troubleshoot it.
- **Update**: refresh an installed setup after tooling changes.

If ambiguous, use Doctor when `.githooks/pre-commit` exists; otherwise use Setup.
Read all applicable references before proposing changes.

## Safety contract

The extension intentionally does not run commit-time tests: OMP has no verified
synchronous tool-call execution API for safely running a repository's test
command. Setup MUST create a real `.githooks/pre-commit` test gate instead.
That hook runs the configured test command before `git commit`; passing allows
the commit, failing exits non-zero and prints the captured output. `jj commit`
does not invoke Git pre-commit hooks, so explain that limitation and use the
project's verified jj-native hook mechanism only when the user supplies one.

The extension does not intercept arbitrary Bash and does not silently mutate
files. Never claim that an automatic hook was installed unless the user
confirmed the exact file edits and commands. Hook creation, settings changes,
chmod, and format/lint commands are explicit agent actions requiring user
confirmation.

## Setup

1. Detect VCS, languages/tooling, existing `.githooks`, `.claude` settings, and
   whether this is a monorepo. Read `references/detection.md`.
2. Read optional `.claude/hook-guard.local.md` and summarize proposed checks.
3. Present a plan covering pre-commit security/integrity checks, optional
   lint/format/test checks, and commit-message checks. Ask for confirmation.
4. After confirmation, show and apply each file edit and any `git config
   core.hooksPath .githooks` command separately. If executable permissions are
   needed, ask before an explicit chmod command; never imply it happened.
5. Summarize touched files and tell the user to run Doctor.

## Doctor

Report PASS/WARN/FAIL for every item in `references/pre-commit-checks.md`:
configured hooks path, hook presence and executable bit, settings shape, tool
availability, CLAUDECODE skip marker, override schema, and (only after asking)
a dry-run. Remediation is guidance plus an explicit confirmed action, not an
implicit write. End with `Result: N/M checks passed`.

## Update

Verify the setup, re-detect tooling, and show a diff-style proposal. Preserve
unrelated settings and user checks. Ask before changing any hook, settings,
permission, or hooks-path configuration. Finish by recommending Doctor.
