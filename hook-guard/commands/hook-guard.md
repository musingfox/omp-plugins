---
name: hook-guard
description: Set up, diagnose, or update confirmed Git pre-commit test gates and integrity checks.
argument-hint: <setup|doctor|update>
---

# Hook Guard

Treat `$ARGUMENTS` as one of `setup`, `doctor`, or `update`; if absent, ask the
user which mode they want. Read `skills/hook-guard/SKILL.md` and its references
before acting. This command is the OMP-native entry point; it performs no writes
merely because the package is loaded.

## Setup

Follow detection, then present the proposed `.githooks/pre-commit` and optional
`.githooks/commit-msg` contents, configured test command, integrity checks, and
`git config core.hooksPath .githooks`. Ask for explicit confirmation. After
approval, create the actual files and executable permissions using OMP file and
command primitives, one confirmed action at a time. The pre-commit hook MUST
run the configured test command: success allows `git commit`; failure prints
output and exits non-zero. Never claim setup without observing each result.

## Doctor

Inspect the real repository: VCS, `core.hooksPath`, `.githooks/pre-commit` and
`commit-msg` presence/executable state, configured test command, and enabled
security/integrity checks. Report PASS/WARN/FAIL and offer separately confirmed
remediation. A dry run requires confirmation. End with `Result: N/M checks passed`.

## Update

Read the current hooks and overrides, re-detect tooling, and present a diff.
Preserve unrelated user checks. Apply only after explicit confirmation, then
recommend Doctor. Git pre-commit hooks do not run for `jj commit`; document that
limitation unless the project supplies a verified jj-native mechanism.
