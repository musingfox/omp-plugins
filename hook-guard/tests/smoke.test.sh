#!/usr/bin/env bash
# Assembles pre-commit and commit-msg from the bash blocks in the references,
# installs them in a temp repo, and checks they block bad commits and allow good ones.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF="$ROOT/skills/hook-guard/references"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
trap 'echo "smoke failed at line $LINENO" >&2' ERR

# nth fenced bash block of a markdown file
block() { awk -v n="$2" '/^```bash/{i++; on=(i==n); next} /^```/{on=0} on' "$1"; }

PC="$REF/pre-commit-checks.md"
{ block "$PC" 2; block "$PC" 3; block "$PC" 4; } > "$T/checks.txt"
block "$PC" 5 | sed -e 's/# \[LINT_COMMAND\]/true/' -e 's/# \[FORMAT_CHECK_COMMAND\].*/true/' -e 's/# \[TEST_COMMAND\]/sh .\/test.sh/' >> "$T/checks.txt"
sed -n 's/^\(check_[a-z_]*\)() {.*/\1/p' "$T/checks.txt" > "$T/calls.txt"

mkdir -p "$T/repo/.githooks"
block "$PC" 1 | awk -v f="$T/checks.txt" -v c="$T/calls.txt" '
  /^# \.\.\. check functions here/ { while ((getline l < f) > 0) print l; next }
  /^# Call each enabled check/ { while ((getline l < c) > 0) print l; next }
  { print }' > "$T/repo/.githooks/pre-commit"
block "$REF/commit-msg.md" 1 > "$T/repo/.githooks/commit-msg"
chmod +x "$T/repo/.githooks/pre-commit" "$T/repo/.githooks/commit-msg"
bash -n "$T/repo/.githooks/pre-commit"
if grep -q '\[[A-Z_]*COMMAND\]' "$T/repo/.githooks/pre-commit"; then echo "unreplaced placeholder"; exit 1; fi

cd "$T/repo"
git init -q
git config core.hooksPath .githooks
git config user.email t@t
git config user.name t

printf 'exit 0\n' > test.sh
echo ok > a.txt
git add a.txt test.sh
git commit -q -m "feat: passing" >/dev/null

printf 'exit 1\n' > test.sh
git add test.sh
if git commit -q -m "feat: failing test" >/dev/null 2>&1; then echo "failing test did not block"; exit 1; fi

printf 'exit 0\n' > test.sh
printf '<<<<<<< HEAD\n' > c.txt
git add test.sh c.txt
if git commit -q -m "feat: conflict" >/dev/null 2>&1; then echo "conflict marker did not block"; exit 1; fi
git rm -q --cached c.txt

echo d > d.txt
git add d.txt
if git commit -q -m "not conventional" >/dev/null 2>&1; then echo "commit-msg did not block"; exit 1; fi
git commit -q -m "feat: second passing" >/dev/null
echo "hook-guard smoke: ok"
