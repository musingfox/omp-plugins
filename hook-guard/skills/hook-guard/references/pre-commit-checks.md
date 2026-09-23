# Pre-commit checks contract

A generated `.githooks/pre-commit` MUST inspect staged files and exit non-zero
for failed security/integrity checks. It MUST run the configured project test
command before allowing `git commit`; capture/display its output and return its
failure status. A passing test command allows the commit. Always-run checks
include secrets/private keys, sensitive paths, oversized files, conflict markers,
broken symlinks, and syntax where a verified parser exists. Projects MAY add
trailing whitespace, EOF-newline, no-commit markers, mixed line endings, and
lock-file consistency.
integrity checks MUST still run. Never emit placeholder commands or mutate files
from a check.

A generated hook MUST include a clear summary and return 1 on failures. Dry-runs
are opt-in and require user confirmation. This reference defines the contract;
it is not an automatic hook generator.
