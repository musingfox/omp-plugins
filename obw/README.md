# Obsidian Workspace

Project-scoped Obsidian vault productivity for oh-my-pi — quick capture, long-form notes, and project management. It owns folder layout, file templates, and PM conventions; all vault I/O runs the Obsidian CLI in the main context, deferring to the `obsidian` skill for syntax.

Slash commands: `/obw-init`, `/obw-jot`, `/obw-pm`.

## Skills

| Skill | Purpose |
|-------|---------|
| `/obw-init` | Pick a vault, write `.obsidian.yaml`, install starter templates into your vault's Templates folder |
| `/obw-jot <text>` | Quick capture (timestamped bullet to today's daily note) or long-form note — triages by input shape |
| `/obw-pm [intent]` | Task / document / ADR lifecycle, project-scoped; free-form natural language |

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
    ├── dashboard.base    # Project dashboard (optional, Bases)
    ├── tasks/            # Active tasks
    ├── archive/          # Completed tasks
    └── docs/             # Docs + ADRs
```

## Property Schema

Dashboards and searches depend on these frontmatter fields. If you edit the installed templates, keep the field names.

- **Task** — `type: task`, `status` (`todo` / `in-progress` / `blocked` / `done`), `priority` (`high` / `medium` / `low`), `project`, `due` (date), `tags` (list), `created`, `completed`
- **Doc** — `type: doc`, `project`, `created`, `updated`
- **ADR** — `type: adr`, `project`, `status` (`proposed` / `accepted` / `deprecated` / `superseded`), `created`, `deciders`

## Examples

```
/obw-jot #worklog 完成 API 重構 PR，等 review
/obw-jot API Redesign Proposal --folder Architecture --tag design
/obw-pm add task implement-auth, high priority, due 2026-05-01
/obw-pm create adr about switching to SQLite
/obw-pm implement-auth is done, archive it
/obw-pm refresh dashboard
```