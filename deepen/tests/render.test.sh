#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail() { echo "FAIL: $*" >&2; exit 1; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
report="$t/report.md"
printf '# survey\n' > "$report"
mkdir -p "$t/deepen" "$t/viz/v1.9.0/lib" "$t/viz/v1.10.0/lib"
cat > "$t/viz/v1.9.0/lib/render.sh" <<'EOF'
#!/usr/bin/env bash
echo "old"
EOF
cat > "$t/viz/v1.10.0/lib/render.sh" <<'EOF'
#!/usr/bin/env bash
echo "new"
EOF
chmod +x "$t"/viz/*/lib/render.sh
out="$(OMP_PLUGIN_ROOT="$t/deepen" bash deepen/scripts/render-survey.sh "$report" 2>&1)"
printf '%s\n' "$out" | grep -qF 'new' || fail 'highest viz version was not selected'
if printf '%s\n' "$out" | grep -qF 'old'; then fail 'older viz version was selected'; fi
rm -rf "$t/viz"
mkdir -p "$t/deepen"
out="$(OMP_PLUGIN_ROOT="$t/deepen" bash deepen/scripts/render-survey.sh "$report" 2>&1)"
printf '%s\n' "$out" | grep -qF '# survey' || fail 'inline fallback omitted report'
printf '%s\n' "$out" | grep -qF '[deepen] render=inline' || fail 'inline fallback marker missing'
echo 'ok - render version selection and fallback'
