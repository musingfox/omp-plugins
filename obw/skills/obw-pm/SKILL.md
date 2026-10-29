---
name: obw-pm
description: Obsidian Workspace PM — tasks, documents, and ADRs. Supports kebab-case names, relations, ticket publishing, frontier queries, and warranted ADRs.
---

# pm — Obsidian Project Management

Run the `obsidian` CLI directly in the main context (never spawn a task). Before any CLI call, read the official Obsidian CLI skill for exact syntax; never run `obsidian help`/`--help`. All vault I/O uses the CLI; do not use filesystem reads or writes against the vault.

Read `.obsidian.yaml` before every operation. Missing config or `pm.project` means tell the user to run `/obw-init` and stop; never guess the vault. `file=` is a bare wikilink name (without path or `.md`); use `path=` for vault-relative paths. `property:set` replaces a value, so read existing lists before adding entries. One property per call; use `type=list` for lists and `type=date` for dates. Wikilinks in a list property (`blocked_by`, `related`) need a JSON array as the value, even for one link: a bare or comma-separated wikilink is stored as one string. Example: `obsidian vault={vault} property:set path="pm/{project}/tasks/{kebab}.md" name=blocked_by value='["[[first-blocker]]","[[second-blocker]]"]' type=list`.

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

All new note filenames are kebab-case: lowercase, whitespace and punctuation become `-`, repeated separators collapse, and Unicode is retained. Human-readable titles go in `title` frontmatter. Examples: `Implement Auth` → `implement-auth.md`; ADR `Switch to SQLite` → `adr-0007-switch-to-sqlite.md`.

Fixed templates are `task`, `doc`, and `adr`, installed by `/obw-init`; if one is absent, stop and ask the user to re-run init rather than inline a template.

## Operations

- **Create task**: `create` `pm/{project}/tasks/{kebab}.md` with `template=task`; set `title`, `project`, and requested `priority`, `due`, `tags`.
- **Create doc**: create `pm/{project}/docs/{kebab}.md` with `template=doc`; set `title` and `project`.
- **Create ADR**: apply the Decision Warrant first, then search existing ADRs for the next number, zero-padded to four digits; create `pm/{project}/docs/adr-{NNNN}-{kebab}.md` with `template=adr`, then set `title`, `project`, and `status`.
- **List**: search with `query="[type:task] [project:{project}] [status:<s>]" format=json`.
- **Archive**: confirm first; inspect dependents, set `status=done` and `completed`, then move to `pm/{project}/tasks/archive`.
- **Delete/replace/supersede**: confirm first. If delete is unavailable, move to archive; never silently replace an existing note.

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

Before any vault write, preview a numbered list with **Title**, **Blocked by**, and **What it delivers**. Ask via OMP `ask` with at least: approve, too coarse, too fine, edges wrong. Revise and repeat until approved. Publish blockers first. For each ticket: create one kebab-cased task with `template=task`, set `title`/`project`, and fill `## Description` plus `## Acceptance Criteria`; if blocked, set complete `blocked_by` list once and `status=blocked`; if splitting a same-project task, set `parent` to `[[source]]`. Never modify the source. End with a receipt of created filenames.

## Frontier

Startable non-done tasks are one search:

```
query="[type:task] [project:{project}] -[status:done] -[blocked_by:\"[[\"]" format=json
```

`blocked_by` values are wikilinks; an empty list is not excluded by mere property presence.

## ADR Decision Warrant

An ADR is created only when **all three** conditions hold:

1. **Hard to reverse** — changing the decision later has real cost (migration, data loss, or external commitment).
2. **Confusing without context** — a future reader would reasonably ask why it was done this way.
3. **Real trade-off** — at least two genuine options were considered and weighed; “do nothing” alone does not count.
Apply the warrant before creating or superseding an ADR. If condition 1 or 2 fails, decline and redirect to a plain doc. If condition 3 fails, decline and redirect to a spec (an invariant/constraint), unless the user explicitly reaffirms after seeing the failed condition. The first format/bootstrap ADR is exempt. Existing ADR audits may flag failures but never edit them automatically.

## Schema

Task: `title`, `type: task`, `status` (todo/in-progress/blocked/done), `priority` (high/medium/low), `project`, `due`, `tags`, `parent`, `blocked_by`, `related`, `created`, `completed`.
Doc: `title`, `type: doc`, `project`, `created`, `updated`.
ADR: `title`, `type: adr`, `project`, `status` (proposed/accepted/deprecated/superseded), `created`, `deciders`.

## Dashboards

Dashboards are Obsidian Bases (`.base`, core in Obsidian 1.9+). Generate only when asked, or recreate a missing project dashboard before reporting the PM operation complete. Use shell-piped `${OMP_PLUGIN_ROOT}/templates/dashboard-cross.base` and `dashboard-project.base` content with the CLI; never read template contents into the conversation.

- **Cross-project**: `pm/dashboard.base`, generated from `dashboard-cross.base`.
- **Per-project**: `pm/{project}/dashboard.base`, generated from `dashboard-project.base` after replacing `__PROJECT__`.

For `refresh dashboard`, inspect the existing dashboard's view names with `obsidian vault=<vault> read path="..." | grep -E 'name:|^Error'`; an error means the file is missing and it may be recreated without confirmation. Compare against template view names using `grep '^    name:'` only. Report missing views and ask before using CLI `overwrite`, warning that hand edits will be discarded. Apply the same rules independently to project and cross-project dashboards; do not overwrite a dashboard whose views already match. Conversation-mode status searches summarize without writing dashboards.
