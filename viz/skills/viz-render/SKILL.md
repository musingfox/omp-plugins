---
name: viz-render
description: >-
  Render markdown or Mermaid content as formatted HTML in the browser.
  Triggers when the user asks to view, render, or preview a document as HTML;
  when the user asks to visualize, diagram, chart, or draw architecture,
  flows, sequence/class/state/ER diagrams; when resolving plan files from
  ~/.omp/plans/; or proactively when about to output a table over ~20 lines
  or with 4+ rows and 3+ columns, a structured comparison, an audit, a feature
  matrix, or any formatted content exceeding ~20 lines in the terminal.
---

# Viz Render Skill

Render markdown documents, Mermaid diagrams, or plan files as formatted HTML
with syntax highlighting, math formulas, and Pele diagrams (Mermaid syntax), in the dark-only
Musingfox design system. One skill, one script, three input shapes.

Requires macOS (`open`, `stat -f`), `python3`, `curl`, `lsof`, and network
access for the CDN that loads Pele, KaTeX, and highlighting.

## When NOT to Use

- Short non-table content (<20 lines) or simple diagrams (2–8 nodes) — use the
  viz-inline skill's chat shapes (call tree, pseudocode, diff) instead
- User explicitly wants terminal/text output
- User is asking to edit or modify the content, not view it

Plugin root is the package directory that contains `lib/render.sh` and `skills/` (this file is `skills/viz-render/SKILL.md`). Use `${OMP_PLUGIN_ROOT}` if set.

## Input Shapes → Workflow

### Shape A: file path

User gave an absolute/relative path to a markdown file.

```bash
bash "${OMP_PLUGIN_ROOT}/lib/render.sh" "{file_path}" "doc-{name}"
```

### Shape B: plan name (bare name, no path separator, no `.md`)

List available plans or resolve by name from `$HOME/.omp/plans`:

```bash
INPUT="$ARGUMENTS"
PLANS_DIR="${OMP_PLANS_DIR:-$HOME/.omp/plans}"

if [ -z "$INPUT" ]; then
    echo "Available plans in $PLANS_DIR:"
    ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -20 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  - /'
elif [ -f "$INPUT" ]; then
    DOC_FILE="$INPUT"; DOC_NAME=$(basename "$DOC_FILE" .md)
    bash "${OMP_PLUGIN_ROOT}/lib/render.sh" "$DOC_FILE" "doc-$DOC_NAME"
else
    DOC_FILE="$PLANS_DIR/$INPUT.md"
    [ -f "$DOC_FILE" ] && bash "${OMP_PLUGIN_ROOT}/lib/render.sh" "$DOC_FILE" "doc-$INPUT" \
      || { echo "Plan not found: $INPUT.md"; ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -10 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  - /'; }
fi
```

### Shape C: inline content or Mermaid code

Write the content (or Mermaid wrapped in a ```` ```mermaid ```` fence) to a
temp markdown file, then render.

For inline markdown, write to `/tmp/viz-doc-{timestamp}.md`.

For bare Mermaid code, wrap as:

````markdown
# {Diagram Title}

```mermaid
{mermaid code}
```
````

…write to `/tmp/viz-diagram-{name}.md`, then:

```bash
bash "${OMP_PLUGIN_ROOT}/lib/render.sh" "/tmp/viz-diagram-{name}.md" "diagram-{name}"
```

## Generating Mermaid From Scratch

When the user requests a diagram without providing the code:

1. Pick a diagram type (see `references/diagram-types.md` for syntax)
2. Keep it focused: descriptive labels <30 chars, no-space IDs
3. If requirements are too broad, suggest splitting into multiple diagrams
4. After rendering, ask the user to confirm the diagram drew: Pele runs in
   the browser, and a syntax error shows as red text in place of the diagram,
   visible only to them

## Output

The render script prints the output HTML path (under `/tmp/viz/{project}/`),
then a `URL:` line, and opens that URL in the default browser. Every render goes
through the local viz server on `127.0.0.1`; only when no port is free does it
fall back to opening the file and print no URL. Report the path to the user.

Over SSH (`SSH_CLIENT` or `SSH_CONNECTION` set) the server binds `0.0.0.0`, the
`URL:` line carries the Tailscale IP, and no browser opens. Report that URL to
the user instead of the path.

## Recipes (interactive HTML artifacts)

If the markdown file starts with frontmatter `viz: <recipe>`, the render
script swaps the generic viewer for a recipe-specific interactive template.
Recipes treat markdown as the canonical source: the HTML reads from it on
load and exports a roundtrippable markdown back to the clipboard on Export.

Use a recipe when the user wants an output they will iterate on (mark items
as done/wontfix, filter, edit fields), not just read.

Available recipes:

- **pr-review** — severity-grouped finding cards with status badges,
  inline-editable metadata, and severity filters. See
  `references/recipes/pr-review.md` for the markdown structure spec.
- **feedback** — renders any markdown read-only and collects a structured
  answer (option pick + notes) written back into frontmatter; a round of
  several decisions opens on a card view projected from the body, with the
  verbatim markdown one click away. See `references/recipes/feedback.md`.

Controls: **Save** writes the edit back to the source `.md` (labelled 儲存回饋
in feedback); **Export** copies the updated markdown to the clipboard (labelled
複製 in feedback).

Workflow:

1. Author the markdown with the recipe's frontmatter and structure.
2. `bash "${OMP_PLUGIN_ROOT}/lib/render.sh" <file.md> <output-name>`
3. Wait for the save as in "Recipe round-trip (OMP)" below; on the Save path the
   source `.md` is read back without a paste.
4. Fallback when the page opened over `file://` (Save hidden): the user clicks
   Export and pastes the markdown to chat; overwrite the source `.md` and
   re-render.

Markdown without `viz:` frontmatter falls through to the generic viewer
unchanged.

The viz server, and with it the recipe Save endpoint, listens on port `18090` by default. If that port is
held by another process, render.sh auto-selects the next free port (trying
up to 5 candidates) so the recipe still opens over `http://` — no manual
override needed. Set `VIZ_PORT=<port>` only to pin a specific base port.

## Recipe round-trip (OMP)

A recipe's **儲存** button writes back to the source `.md` via `/api/save`. Pick one:

1. **Simple (default)**: after render, `ask` once ("Click 儲存 when done editing"), then `read` the source path and diff.
2. **Automated**: `hub start` a short-lived mtime watcher, then `hub wait` with `pattern: recipe-saved`. On match, `read` the source, diff, report, then `hub stop`.

**Prerequisite**: recipe must open on `http://127.0.0.1:<port>/...`. If render fell back to `file://`, 儲存 is hidden — use Export/複製 instead.

## References

- **Diagram type syntax**: `references/diagram-types.md`
- **Recipe specs**: `references/recipes/`
- **Mermaid docs**: https://mermaid.js.org/
- **Live editor**: https://mermaid.live
