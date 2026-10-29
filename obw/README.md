# Obsidian Workspace

Project-scoped Obsidian tasks for pi and oh-my-pi (OMP). All vault I/O uses the `obsidian` CLI.

**Status:** pi 1.1.0 has verified task browsing, persistent session binding, work-start recording, and explicit `/obw-sync`. OMP 18.13.3 has the same commands and card keys, checked by unit tests, fixtures on the official OMP loader, and a real OMP session with a fake provider. OMP records work start later than Pi (see below). No live OMP run against a vault or a model has been made, and cross-host acceptance is not complete. The checks now pin pi 1.4.0 and OMP 18.13.3; the pi acceptance runs were made on 1.1.0 and have not been repeated on 1.4.0. See the [implementation and acceptance record](docs/dual-host-plan.md).

## Extension commands

| Command | Pi | OMP |
|---------|----|-----|
| `/issue [view]` | Browse the configured project's dashboard; defaults to All Tasks | Same as Pi |
| `/obw-bind <task path>` | Bind the persisted session to a vault-relative project task | Same as Pi |
| `/obw-unbind` | Remove the active-branch binding without changing the vault | Same as Pi |
| `/obw-sync` | Append the current completed reply snapshot and verify readback | Same as Pi |

`/issue` requires TUI mode. Left/Backspace returns to the previous page; Escape/q exits. Card keys on both hosts are `b` to Bind and `u` to Unbind. A foreign-owner replacement requires explicit confirmation: `y` approves; `n`, Enter, or Back declines; Exit cancels the pending approval. The project comes from `.obsidian.yaml`; there is no project picker.

Both hosts restore binding from the active session branch. A new session has no session file until its first reply, so it cannot bind before then. The card's `session` property records its owner; Unbind does not clear that property or historical Agent records. On Pi, during a normal model request, the `context` observer records work start after the real user message is persisted. Failures before that boundary are not covered. Neither host automatically writes results or changes task status.

On OMP 18.13.3, work start is recorded from the user message's `message_end` event. OMP fires `context` before it persists the turn's user message, and it has no awaited hook between persisting that message and starting the model request. The handler waits up to 2 seconds for the user entry to reach the session branch, then records it once; if the entry never appears, it warns and writes nothing, and a session, branch, input, or binding change during that wait refuses the record. OMP does not wait for this handler, so the record can land after the model request has started. Steering messages (user messages marked `steering`) and auto-continue prompts (developer messages) do not record a start.

`/obw-sync` uses the latest completed assistant reply after the current user message. Errors, aborts, tool calls, empty replies, unpersisted sources, and historical fallback are refused. It appends the first nonempty line under `## Agent`; multiline text also goes to `pm/{project}/runs/{card}.md` with a card link. Repeating the same source ID does not duplicate records. A changed session, branch, input, or binding invalidates a pending request. Partial writes can remain; a verified receipt requires matching readback.

Print/JSON reports use stderr; RPC/TUI reports use notifications. `/issue` reports its mode restriction rather than opening a custom UI outside TUI.

## Pm tools (OMP)

The OMP extension registers three tools the model can call to change a task card:

- `pm_tick {card, index, checked}` sets the `index`-th checkbox (from 1) under `## Acceptance Criteria`.
- `pm_note {card, line}` appends `- line` at the end of `## Notes`, creating the section when it is missing.
- `pm_status {card, status}` sets the frontmatter `status` to `todo`, `in-progress`, `blocked` or `done`. It does not bind the session.

`card` is the file name without `.md`: `a` is `pm/<project>/tasks/a.md`, with the vault and project from the nearest `.obsidian.yaml`. A name that is empty, `.` or `..`, or holds `/`, `\` or a control character is refused before any CLI call. Each call reads the card with `obsidian vault=<vault> eval`, writes it only if it is unchanged since that read, and reads it back; calls run one after another. The result is one JSON line of text: `{"ok":true,"path":"pm/<project>/tasks/a.md"}`, or `{"ok":false,"reason":"..."}` with `isError` set. The logic lives in `pm.ts`; `index.ts` only registers it.

Pi does not get these tools yet. Pi's `registerTool` takes a TypeBox schema, so a pi adapter would need a `typebox` dependency rather than reuse the JSON Schema in `pm.ts`.

## OMP skills

The Pi manifest exposes only the extension. It does not load these OMP skills or markdown commands.

| Skill | Purpose |
|-------|---------|
| `/obw-init` | Pick a vault, write `.obsidian.yaml`, install templates, bootstrap a project skeleton, and migrate pre-0.9 layouts |
| `/obw-jot <text>` | Quick capture (timestamped bullet to today's daily note) or long-form note |
| `/obw-pm [intent]` | Task / document lifecycle, relations, and previewed ticket publishing; ADRs belong to the `adr` skill |

## OMP skill conventions

- **Vault I/O** goes through the `obsidian` CLI in the main context (no `task` spawn). This plugin does not duplicate CLI syntax; it defers to the `obsidian` skill.
- **Daily notes** use Obsidian's **Daily Notes** core plugin (folder / filename / template). Quick capture calls `daily:append`.
- **Templates** (`task`, `doc`) live in your vault's Obsidian Templates folder. On `/obw-init` the plugin copies starter files from `templates/` only if the same name doesn't already exist — it never overwrites your edits.
- **Dashboards** (optional) are **Obsidian Bases** (`.base` files — core in Obsidian 1.9+) generated from plugin-internal templates via shell substitution, so contents never enter the session context.

## Prerequisites

- [Obsidian](https://obsidian.md) app running, with a working `obsidian` executable on PATH. See the [Obsidian CLI documentation](https://help.obsidian.md/cli). This is not the unrelated standalone `obsidian-cli` binary by Yakitrak.
- For OMP skills, kepano's [obsidian-skills](https://github.com/kepano/obsidian-skills) linked as an OMP package (`package.json` with `"omp": {}` + `omp plugin link --local`).
- **Templates** core plugin enabled (required for `/obw-pm` — `task` / `doc` templates)
- **Daily Notes** core plugin enabled (required for `/obw-jot` quick capture)
- **Bases** core plugin enabled (required only for `/obw-pm` dashboards — bundled in Obsidian 1.9+)
- [uv](https://docs.astral.sh/uv/) (required by `/obw-pm refresh dashboard` and by `tests/dashboard-diff.test.sh` in `check`, which run `scripts/dashboard-diff.py` with pyyaml)

## Installation

For a temporary Pi load, run these commands from this repository's root after installing official Pi:

```bash
bun install --cwd obw --frozen-lockfile --omit peer --ignore-scripts
pi --extension ./obw/pi.ts
```

Peer dependencies are omitted to avoid installing another host runtime. This invocation does not change persistent Pi settings. Configure `.obsidian.yaml` yourself; Pi does not expose `/obw-init`.

OMP package loading:

```bash
omp plugin link --local /path/to/omp-plugins/obw
omp plugin link --local /path/to/obsidian-skills
```

Vault operations use `obsidian`, `jq`, `cp`, and `sed`. Approve those tools when OMP prompts.

## Configuration

In OMP, run `/obw-init` in a project root. In Pi, create `.obsidian.yaml` with the same format:

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

```text
pm/
├── dashboard.base        # Cross-project dashboard (optional, Bases)
└── {project}/
    ├── dashboard.base    # Project dashboard
    ├── tasks/            # Active tasks
    │   └── archive/      # Completed tasks
    ├── docs/             # Docs
    └── runs/             # Multiline reply snapshots, created on demand
```

`/obw-init` creates this skeleton. Re-running it offers safe pre-0.9 migration: archive moves use the Obsidian CLI, missing titles are optionally backfilled, and stale dashboards are left to `/obw-pm refresh dashboard`. That command compares a dashboard with the template as parsed YAML (`scripts/dashboard-diff.py`), regenerates an unedited older version, and asks before discarding hand edits. Existing filenames and hand-edited templates are preserved.

## Property Schema

Dashboards and searches depend on these frontmatter fields. If you edit the installed templates, keep the field names.

- **Task** — `title`, `type: task`, `status` (`todo` / `in-progress` / `blocked` / `done`), `priority` (`high` / `medium` / `low`), `project`, `due` (date), `tags` (list), `parent` (link), `blocked_by` (list of links), `related` (list of links), `created`, `completed`
- **Doc** — `title`, `type: doc`, `project`, `created`, `updated`

New notes use kebab-case filenames while `title` retains the human-readable name. ADRs are not pm notes: use the `adr` skill, which writes them to the repository. The project dashboard's Docs view still lists `type: adr` notes already in a vault.

## Checks

From the repository root:

```bash
bun run --cwd obw typecheck:pi
bun run --cwd obw typecheck:core
bun run --cwd obw typecheck:tools
bun run --cwd obw check:load
bun run --cwd obw test
```

Pi/core source checks are strict; the tools check uses checkJs. These commands cover different layers, not a full-package success claim. The OMP typecheck sets `skipLibCheck`, because OMP's published declaration graph does not type-check on its own; OBW's own use of the OMP API stays strict. `bun run --cwd obw check` runs in the repo-local pre-commit hook; do not bypass it. The [acceptance record](docs/dual-host-plan.md#8-pi-驗收紀錄) distinguishes unit/fixture, headless, model, and live-browser evidence.

## OMP skill examples

```text
/obw-jot #worklog 完成 API 重構 PR，等 review
/obw-jot API Redesign Proposal --folder Architecture --tag design
/obw-pm add task implement-auth, high priority, due 2026-05-01
/obw-pm implement-auth is done, archive it
/obw-pm refresh dashboard
```