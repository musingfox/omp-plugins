# OMP safety boundary

The original Claude Code plugin describes PostToolUse and PreToolUse hooks.
OMP hook-guard does not assume those Claude-only hook metadata APIs exist.
The verified runtime behavior is the `/hook-guard` command. OMP does not expose
a verified synchronous API for running repository tests from `tool_call`, so
the commit-time gate belongs in a real, user-confirmed `.githooks/pre-commit`
script. That script MUST exit non-zero and print output when its configured
test command fails. Git invokes it for `git commit`; jj commits require a
separate, verified jj-native mechanism if the project has one.

Never intercept arbitrary Bash or claim test execution happened in the
extension. Never fabricate automatic Edit/Write formatting, linting, chmod,
git-hook generation, or settings mutation. Those operations require an agent
to show the exact action and receive confirmation.
