---
name: obw-pm
description: Obsidian Workspace PM — tasks and documents. Supports kebab-case names, relations, ticket publishing, and frontier queries. ADRs belong to the adr plugin; use the `adr` skill for them.
---

# pm — Obsidian Project Management

Run the `obsidian` CLI directly in the main context (never spawn a task). Before any CLI call, read the official Obsidian CLI skill for exact syntax; never run `obsidian help`/`--help`. All vault I/O uses the CLI; do not use filesystem reads or writes against the vault.

Read `.obsidian.yaml` before every operation. Missing config, `vault` or `pm.project` means tell the user to run `/obw-init` and stop; never guess the vault. Every CLI call passes `vault={vault}` as its first argument, as in `obsidian vault={vault} read path=...`; without it the CLI targets the most recently focused vault. `file=` is a bare wikilink name (without path or `.md`); use `path=` for vault-relative paths. `property:set` replaces a value, so read existing lists before adding entries. One property per call; use `type=list` for lists and `type=date` for dates. Wikilinks in a list property (`blocked_by`, `related`) need a JSON array as the value, even for one link: a bare or comma-separated wikilink is stored as one string. Example: `obsidian vault={vault} property:set path="pm/{project}/tasks/{kebab}.md" name=blocked_by value='["[[first-blocker]]","[[second-blocker]]"]' type=list`.

## Vault layout

```
pm/{project}/
├── dashboard.base
├── tasks/
│   └── archive/
└── docs/
```

Folders are created on demand by `create`/`move`. If a project dashboard is missing, regenerate it from `${OMP_PLUGIN_ROOT}/templates/dashboard-project.base`; do not overwrite an existing dashboard during ordinary status operations. Preserve existing dashboards and templates unless the user explicitly requests regeneration.

## Names and templates

All new note filenames are kebab-case: lowercase, whitespace and punctuation become `-`, repeated separators collapse, and Unicode is retained. Human-readable titles go in `title` frontmatter. Example: `Implement Auth` → `implement-auth.md`.

Fixed templates are `task` and `doc`, installed by `/obw-init`; if one is absent, stop and ask the user to re-run init rather than inline a template.

## Operations

- **Create task**: `obsidian vault={vault} create` `pm/{project}/tasks/{kebab}.md` with `template=task`; set `title`, `project`, and requested `priority`, `due`, `tags`.
- **Create doc**: `obsidian vault={vault} create` `pm/{project}/docs/{kebab}.md` with `template=doc`; set `title` and `project`.
- **List**: `obsidian vault={vault} search` with `query="[type:task] [project:{project}] [status:<s>]" format=json`.
- **Archive**: confirm first; inspect dependents, set `status=done` and `completed`, then `obsidian vault={vault} move` to `pm/{project}/tasks/archive`.
- **Delete/replace**: confirm first. If delete is unavailable, move to archive; never silently replace an existing note.

A known-name read is one direct CLI call; never search first. A create error stops publishing: report landed and unlanded filenames and never retry the create. Report success only with the CLI receipt.

## Relations

Tasks use wikilink properties: `blocked_by` (list), `related` (list), and `parent` (single). Never create inverse `blocks` or `subtasks` fields; infer inverse edges from backlinks or Bases `file.hasLink()`.

- Resolve uncertain targets with search and refuse links to missing notes.
- Values are `[[kebab-name]]`. Since `property:set` replaces, read the current `blocked_by`/`related` list and set the complete list, as a JSON array (see the `property:set` rule above), when adding one.
- Adding a blocker sets `status=blocked`. Removing the last blocker asks whether to return to `todo` or `in-progress`.
- Before archiving `X`, search `[blocked_by:X]`; list dependents and ask whether to remove `X` from each. Unblock only those left with no blockers; never edit dependents silently.
- **Cycles** — before adding `A` to `B.blocked_by`, walk A's blocker chain. If it reaches B, refuse and report the cycle.
- `parent` is only for epic/subtask decomposition; use `related` otherwise.

## To Tickets (preview → ask → publish)

Split an in-context spec, task, or named vault reference into independently demoable vertical slices. Look for prefactors first. Each slice has a complete narrow path through schema/API/UI/tests, is verifiable alone, fits one context window, and is not a horizontal layer. Missing reference or empty source writes nothing.

Before any vault write, preview a numbered list with **Title**, **Blocked by**, and **What it delivers**. Ask via OMP `ask` with at least: approve, too coarse, too fine, edges wrong. Revise and repeat until approved. Publish blockers first. For each ticket: `obsidian vault={vault} create` one kebab-cased task with `template=task`, set `title`/`project`, and fill `## Description` plus `## Acceptance Criteria`; if blocked, set complete `blocked_by` list once and `status=blocked`; if splitting a same-project task, set `parent` to `[[source]]`. Never modify the source. End with a receipt of created filenames.

## Frontier

Startable non-done tasks are one search:

```
obsidian vault={vault} search query="[type:task] [project:{project}] -[status:done] -[blocked_by:\"[[\"]" format=json
```

`blocked_by` values are wikilinks; an empty list is not excluded by mere property presence.

## Schema

Task: `title`, `type: task`, `status` (todo/in-progress/blocked/done), `priority` (high/medium/low), `project`, `due`, `tags`, `parent`, `blocked_by`, `related`, `created`, `completed`.
Doc: `title`, `type: doc`, `project`, `created`, `updated`.

## Dashboards

Dashboards are Obsidian Bases (`.base`, core in Obsidian 1.9+). Generate only when asked, or recreate a missing project dashboard before reporting the PM operation complete. Template contents are piped by the shell, never read into the conversation:

- **Cross-project** → `pm/dashboard.base`:
  ```bash
  obsidian vault={vault} create path="pm/dashboard.base" \
    content="$(cat "${OMP_PLUGIN_ROOT}/templates/dashboard-cross.base")" overwrite
  ```
- **Per-project** → `pm/{project}/dashboard.base`:
  ```bash
  obsidian vault={vault} create path="pm/{project}/dashboard.base" \
    content="$(sed "s/__PROJECT__/{project}/g" "${OMP_PLUGIN_ROOT}/templates/dashboard-project.base")" overwrite
  ```

A `refresh dashboard` request brings an existing project dashboard up to the template. Compare the two with the plugin's script. It parses both as YAML, because Obsidian reformats a `.base` it has opened and a text diff is noise, and it prints only the differences, so the template body stays out of context. It needs [uv](https://docs.astral.sh/uv/):

```bash
obsidian vault={vault} read path="pm/{project}/dashboard.base" \
  | uv run --no-project --with pyyaml "${OMP_PLUGIN_ROOT}/scripts/dashboard-diff.py" project {project}
```

Act on the first line of its output:

- `verdict: missing` — the CLI answered `Error: File "…" not found.`, so the dashboard is missing. Recreate it with the per-project command above and stop.
- `verdict: current` — say the dashboard is up to date and stop.
- `verdict: stale <version>` — the dashboard is an earlier template with no hand edits, so overwriting loses nothing. Report the `changes` lines, then regenerate with the per-project command.
- `verdict: edited` — the dashboard matches no template version. Show its `hand edits` lines, measured against the closest version (`base`), and any `changes` lines. Warn that regenerating discards the hand edits, then regenerate only after the user agrees via OMP `ask`.

In those lines, `added` is only in the dashboard, `removed` is only in the template, and `changed` reads dashboard value `->` template value. Any other output is an error; report it as one.

The cross-project file follows the same steps with `path="pm/dashboard.base"`, `cross` in place of `project {project}`, and the cross-project command.

Conversation-mode status searches summarize without writing dashboards. Do not rewrite an existing `.base` file unless asked (a `refresh dashboard` request is asking); the only unprompted write is recreating a project dashboard that has gone missing.
