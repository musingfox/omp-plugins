#!/usr/bin/env bash
# render-decision.sh takes the highest viz version by semantic order, not by
# string order (1.10.0 over 1.9.0), and hands that renderer's URL: line on.
# Carried from the spiral package's render-decision test (dadb051).
set -euo pipefail
fail() { echo "  ✗ $*"; exit 1; }

script="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)/render-decision.sh"
workspace="$(mktemp -d "${TMPDIR:-/tmp}/method-render.XXXXXX")"
trap 'rm -rf "$workspace"' EXIT
mkdir -p "$workspace/method" "$workspace/viz/1.2.0/lib" "$workspace/viz/1.9.0/lib" "$workspace/viz/1.10.0/lib"
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

output="$(OMP_PLUGIN_ROOT="$workspace/method" bash "$script" "$brief" decision)" || fail 'renderer runner failed'
printf '%s\n' "$output" | grep -qF 'renderer=1.10.0' || fail 'highest semantic viz version was not selected'
printf '%s\n' "$output" | grep -qF 'save-mode=browser' || fail 'browser handoff was not observed'
printf '%s\n' "$output" | grep -qF 'URL: http://new.example' || fail 'selected renderer URL was not handed off'
! printf '%s\n' "$output" | grep -qF 'renderer=1.9.0' || fail 'older viz renderer was selected'
printf 'ok - semantic viz resolver and browser handoff\n'
