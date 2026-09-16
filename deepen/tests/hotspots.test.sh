#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail() { echo "FAIL: $*" >&2; exit 1; }
script="$PWD/deepen/scripts/hotspots.sh"
init() { git -C "$1" init -q -b main; git -C "$1" config user.email test@example.invalid; git -C "$1" config user.name test; }
commit() { mkdir -p "$(dirname "$1/$2")"; printf '%s\n' "$2" > "$1/$2"; git -C "$1" add "$2"; git -C "$1" commit -q -m "test(deepen): add $2"; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT; init "$t"
for i in 1 2 3 4 5 6; do commit "$t" "src/orders/$i.txt"; done
for p in src/billing/a.txt docs/b.md lib/c.txt README.md; do commit "$t" "$p"; done
out="$(cd "$t" && bash "$script")"
printf '%s\n' "$out" | grep -qx 'window: 10' || fail 'window'
printf '%s\n' "$out" | grep -qx 'top-share: 60' || fail 'threshold share'
printf '%s\n' "$out" | grep -qx 'scope: hotspot' || fail 'hotspot scope'
[ "$(printf '%s\n' "$out" | grep -E '^[0-9]+ ' | sed -n '1p')" = '6 src/orders' ] || fail 'ranking'
echo 'ok - hotspot threshold'
