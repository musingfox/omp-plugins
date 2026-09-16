#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail() { echo "  ✗ $*"; exit 1; }

license=spiral/LICENSE-upstream
cmd=spiral/commands/spiral.md
[ -f "$license" ] || fail 'upstream license notice missing'
grep -qF 'Permission is hereby granted' "$license" || fail 'license permission notice missing'
grep -qF 'https://github.com/mattpocock/skills' "$cmd" || fail 'upstream source missing'
grep -qF '3cca18b368ae95cdbdebbff572ccafa662551015' "$cmd" || fail 'upstream commit missing'
printf 'ok - upstream attribution notice\n'
