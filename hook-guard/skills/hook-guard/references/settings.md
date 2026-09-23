# Local override guidance

The optional `.claude/hook-guard.local.md` may define `file_size_limit`,
`no_commit_markers`, enabled `checks`, and `lint`, `format`, or `test_gate`
booleans. Parse frontmatter only when a verified parser is available; warn on
unknown fields and preserve user values during Update.

This OMP port does not write Claude settings or claim `CLAUDECODE` integration
is installed. If the user requests such integration, show the exact deep-merge
proposal and obtain confirmation before editing.
