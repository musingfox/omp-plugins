#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
for test in relations.test.sh jot.test.sh pm-vault.test.sh migration.test.sh publish.test.sh warrant.test.sh templates.test.sh; do
  bash "$test"
done
