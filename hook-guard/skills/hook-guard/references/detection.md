# Detection contract

Collect facts before proposing Setup or Update:

- VCS: `.git` and/or `.jj`; this guard supports commit confirmation for both,
  but pre-commit hooks are a Git feature.
- Languages and manifests: `package.json`, `pyproject.toml`, `Cargo.toml`,
  `go.mod`, and workspace/monorepo markers.
- Existing `.githooks`, `.git/hooks`, and `.claude/settings.local.json`.
- Available tools only when the agent can observe them; never claim a tool is
  installed from a manifest alone.

If existing hooks are present, present merge, replace, or abort choices. Do not
write, chmod, or change `core.hooksPath` before confirmation.
