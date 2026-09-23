#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail() { echo "  ✗ $*"; exit 1; }

workspace="$(mktemp -d "${TMPDIR:-/tmp}/spiral-render.XXXXXX")"
trap 'rm -rf "$workspace"' EXIT
mkdir -p "$workspace/spiral" "$workspace/viz/1.2.0/lib" "$workspace/viz/1.9.0/lib" "$workspace/viz/1.10.0/lib"
brief="$workspace/brief.md"
printf '%s\n' '# Decision' > "$brief"

cat > "$workspace/viz/1.2.0/lib/render.sh" <<'EOF'
printf 'renderer=1.2.0\nURL: http://old.example\n'
EOF
cat > "$workspace/viz/1.9.0/lib/render.sh" <<'EOF'
printf 'renderer=1.9.0\nURL: http://old.example\n'
EOF
cat > "$workspace/viz/1.10.0/lib/render.sh" <<'EOF'
printf 'renderer=1.10.0\nURL: http://new.example\n'
EOF

output="$(OMP_PLUGIN_ROOT="$workspace/spiral" bash spiral/scripts/render-decision.sh "$brief" decision)" || fail 'renderer runner failed'
printf '%s\n' "$output" | grep -qF 'renderer=1.10.0' || fail 'highest semantic viz version was not selected'
printf '%s\n' "$output" | grep -qF 'save-mode=browser' || fail 'browser handoff was not observed'
printf '%s\n' "$output" | grep -qF 'URL: http://new.example' || fail 'selected renderer URL was not handed off'
printf '%s\n' "$output" | grep -qvF 'renderer=1.9.0' || fail 'older viz renderer was selected'
printf 'ok - semantic viz resolver and browser handoff\n'
