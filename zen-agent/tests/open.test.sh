#!/usr/bin/env bash
# bin/open redirects an agent's lone URL to zen-agent; everything else reaches the real open.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf '#!/bin/sh\necho real "$@"\n' >"$tmp/real"
printf '#!/bin/sh\necho zen "$@"\n' >"$tmp/zen"
chmod +x "$tmp/real" "$tmp/zen"

run() { # run TARGET [VAR=value...]
  local target="$1"; shift
  env -i ZEN_AGENT_REAL_OPEN="$tmp/real" ZEN_AGENT_BIN="$tmp/zen" "$@" "$HERE/../bin/open" "$target"
}

fail=0
check() {
  if [ "$2" = "$3" ]; then echo "ok: $1"; else echo "FAIL: $1 (got '$3', want '$2')"; fail=1; fi
}

check "AGENT=1 (OMP bash tool) redirects" "zen open https://example.com" "$(run https://example.com AGENT=1)"
check "CLAUDECODE=1 redirects" "zen open https://example.com" "$(run https://example.com CLAUDECODE=1)"
check "human shell goes to real open" "real https://example.com" "$(run https://example.com)"
check "agent non-URL goes to real open" "real /tmp/file" "$(run /tmp/file AGENT=1)"
exit $fail
