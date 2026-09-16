# Obsidian Workspace

Project-scoped Obsidian vault productivity for oh-my-pi — quick capture, long-form notes, and project management. It owns folder layout, file templates, and PM conventions; all vault I/O runs the Obsidian CLI in the main context, deferring to the `obsidian` skill for syntax.

Slash commands: `/obw-init`, `/obw-jot`, `/obw-pm`.

## Skills

| Skill | Purpose |
|-------|---------|
| `/obw-init` | Pick a vault, write `.obsidian.yaml`, install templates, bootstrap a project skeleton, and migrate pre-0.9 layouts |
| `/obw-jot <text>` | Quick capture (timestamped bullet to today's daily note) or long-form note |
| `/obw-pm [intent]` | Task / document / ADR lifecycle, relations, warranted ADRs, and previewed ticket publishing |

## How It Works

- **Vault I/O** goes through the `obsidian` CLI in the main context (no `task` spawn). This plugin does not duplicate CLI syntax; it defers to the `obsidian` skill.
- **Daily notes** use Obsidian's **Daily Notes** core plugin (folder / filename / template). Quick capture calls `daily:append`.
- **Templates** (`task`, `doc`, `adr`) live in your vault's Obsidian Templates folder. On `/obw-init` the plugin copies starter files from `templates/` only if the same name doesn't already exist — it never overwrites your edits.
- **Dashboards** (optional) are **Obsidian Bases** (`.base` files — core in Obsidian 1.9+) generated from plugin-internal templates via shell substitution, so contents never enter the session context.

## Prerequisites

- kepano's [obsidian-skills](https://github.com/kepano/obsidian-skills) linked as an OMP package (`package.json` with `"omp": {}` + `omp plugin link --local`)
- [Obsidian](https://obsidian.md) app running (headless CLI also works)
- Obsidian community plugin **`obsidian-cli`** installed and enabled. The plugin's name is `obsidian-cli` but the executable it installs is `obsidian` (invoked as `obsidian vault=<name> ...`). This is **not** the unrelated standalone `obsidian-cli` binary by Yakitrak.
- **Templates** core plugin enabled (required for `/obw-pm` — `task` / `doc` / `adr` templates)
- **Daily Notes** core plugin enabled (required for `/obw-jot` quick capture)
- **Bases** core plugin enabled (required only for `/obw-pm` dashboards — bundled in Obsidian 1.9+)

## Installation

```bash
omp plugin link --local /path/to/omp-plugins/obw
omp plugin link --local /path/to/obsidian-skills
```

Vault operations use `obsidian`, `jq`, `cp`, and `sed`. Approve those tools when OMP prompts.

## Configuration

Run `/obw-init` in a project root. The generated `.obsidian.yaml`:

```yaml
vault: MyVault

note:
  default_folder: Inbox
  filename_strategy: title     # title | slug | timestamp-title

pm:
  project: my-project          # Omit this section to disable /obw-pm
```

Daily note folder / filename / template are **not** in `.obsidian.yaml` — they come from Obsidian's Daily Notes settings.

## Vault Layout (`/obw-pm`)

```
pm/
├── dashboard.base        # Cross-project dashboard (optional, Bases)
└── {project}/
    ├── dashboard.base    # Project dashboard
    ├── tasks/            # Active tasks
    │   └── archive/      # Completed tasks
    └── docs/             # Docs + ADRs
```

`/obw-init` creates this skeleton. Re-running it offers safe pre-0.9 migration: archive moves use the Obsidian CLI, missing titles are optionally backfilled, and stale dashboards are regenerated only after confirmation. Existing filenames and hand-edited templates are preserved.

## Property Schema

Dashboards and searches depend on these frontmatter fields. If you edit the installed templates, keep the field names.

- **Task** — `title`, `type: task`, `status` (`todo` / `in-progress` / `blocked` / `done`), `priority` (`high` / `medium` / `low`), `project`, `due` (date), `tags` (list), `parent` (link), `blocked_by` (list of links), `related` (list of links), `created`, `completed`
- **Doc** — `title`, `type: doc`, `project`, `created`, `updated`
- **ADR** — `title`, `type: adr`, `project`, `status` (`proposed` / `accepted` / `deprecated` / `superseded`), `created`, `deciders`

New notes use kebab-case filenames while `title` retains the human-readable name. ADR creation requires all three warrant conditions: hard to reverse, confusing without context, and a real trade-off; failures redirect to a doc or spec.

## Examples

```
/obw-jot #worklog 完成 API 重構 PR，等 review
/obw-jot API Redesign Proposal --folder Architecture --tag design
/obw-pm add task implement-auth, high priority, due 2026-05-01
/obw-pm create adr about switching to SQLite
/obw-pm implement-auth is done, archive it
/obw-pm refresh dashboard
```