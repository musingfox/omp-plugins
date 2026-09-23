#!/usr/bin/env bash
# Render a spiral decision brief with the sibling viz package when available.
set -uo pipefail
brief="${1:?usage: render-decision.sh <brief.md> <output-name>}"
name="${2:-spiral-decision}"
if [ ! -f "$brief" ]; then
  echo "[spiral] brief not found: $brief" >&2
  exit 1
fi
root="${OMP_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
render=""
candidates=()
consider() {
  local version="$1" candidate="$2"
  [ -f "$candidate" ] || return 0
  candidates+=("${version}"$'\t'"${candidate}")
}
# Keep unversioned siblings as a fallback, then choose a versioned renderer
# by SemVer precedence (rather than filesystem/glob order).
consider "0.0.0" "$root/../viz/lib/render.sh"
consider "0.0.0" "$root/../../viz/lib/render.sh"
for candidate in "$root/../viz"/*/lib/render.sh "$root/../../viz"/*/lib/render.sh; do
  [ -f "$candidate" ] || continue
  version="$(basename "$(dirname "$(dirname "$candidate")")")"
  if [[ "$version" =~ ^v?[0-9]+(\.[0-9]+){0,2}(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
    consider "${version#v}" "$candidate"
  fi
done

if [ "${#candidates[@]}" -gt 0 ]; then
  render="$(printf '%s\n' "${candidates[@]}" | awk -F '\t' '
    function cmp_pre(a, b,    aa, ab, i, na, nb) {
      if (a == b) return 0
      if (a == "") return 1
      if (b == "") return -1
      na = split(a, aa, "."); nb = split(b, ab, ".")
      for (i = 1; i <= (na > nb ? na : nb); i++) {
        if (i > na) return -1
        if (i > nb) return 1
        if (aa[i] == ab[i]) continue
        if (aa[i] ~ /^[0-9]+$/ && ab[i] ~ /^[0-9]+$/)
          return (aa[i] + 0 > ab[i] + 0) ? 1 : -1
        if (aa[i] ~ /^[0-9]+$/) return -1
        if (ab[i] ~ /^[0-9]+$/) return 1
        return (aa[i] > ab[i]) ? 1 : -1
      }
      return 0
    }
    function newer(a, b,    ac, bc, ap, bp, i, na, nb, npa, npb, pa, pb, c) {
      sub(/\+.*/, "", a); sub(/\+.*/, "", b)
      npa = split(a, ap, "-"); npb = split(b, bp, "-")
      na = split(ap[1], ac, "."); nb = split(bp[1], bc, ".")
      for (i = 1; i <= 3; i++) {
        if ((ac[i] + 0) != (bc[i] + 0))
          return ((ac[i] + 0) > (bc[i] + 0))
      }
      pa = (npa > 1) ? substr(a, length(ap[1]) + 2) : ""
      pb = (npb > 1) ? substr(b, length(bp[1]) + 2) : ""
      c = cmp_pre(pa, pb)
      return c > 0
    }
    !seen || newer($1, best) { best = $1; path = $2; seen = 1 }
    END { if (seen) print path }
  ')"
fi
if [ -n "$render" ]; then
  out="$(bash "$render" "$brief" "$name")"
  printf '%s\n' "$out"
  if printf '%s\n' "$out" | grep -q 'URL: http://'; then
    echo "[spiral] save-mode=browser"
  else
    echo "[spiral] save-mode=inline   # viz Save unavailable — use terminal fallback"
  fi
  exit 0
fi
echo "[spiral] viz render.sh not found — decision brief (read inline):" >&2
printf '%s\n' "----------------------------------------------------------------------" >&2
cat "$brief"
echo "[spiral] save-mode=inline   # viz absent — use terminal fallback"
