# viz

Visual output for oh-my-pi: compact chat shapes (`viz-inline`) and browser HTML (`viz-render`).

Slash commands: `/viz-inline`, `/viz-render`.

## Skills

| Skill | Purpose |
|-------|---------|
| `/viz-inline` | Call trees, component trees, shallow file trees, pseudocode, diffs — in chat, no files |
| `/viz-render [path \| plan-name]` | Markdown / Mermaid / `~/.omp/plans` as HTML; recipe round-trip on `viz:` frontmatter |

## Install

```bash
omp plugin link --local /path/to/omp-plugins/viz
```

`render.sh` lives at `${OMP_PLUGIN_ROOT}/lib/render.sh`. Plan files resolve from `$OMP_PLANS_DIR` or `$HOME/.omp/plans`.

## Recipes

Markdown whose frontmatter includes `viz: <recipe>` uses an interactive template instead of the generic viewer. Specs: `skills/viz-render/references/recipes/`.

- `pr-review` — severity-grouped findings with status
- `feedback` — read-only body plus choice/notes round-trip
