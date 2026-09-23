# Commit message contract

When enabled, `.githooks/commit-msg` MAY validate Conventional Commits:
`type(scope)!: description`, with a configured allow-list of types. It MUST
read the commit-message file supplied as `$1`, report a useful failure, and
return non-zero on invalid input. Do not rewrite messages automatically.

Creating or making this hook executable requires explicit user confirmation.
