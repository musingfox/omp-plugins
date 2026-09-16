---
name: obw-init
description: Interactively create `.obsidian.yaml`, install templates, bootstrap a project skeleton, and migrate pre-0.9 Obsidian Workspace layouts.
---

# init — Initialize Obsidian Workspace

Run directly in the main context; the flow is interactive via OMP `ask`.

1. **Existing config** — If `.obsidian.yaml` exists, show vault/project and ask whether to overwrite. If declined, read its `vault` and `pm.project`, then continue with bootstrap/migration.
2. **Choose vault** — Read Obsidian's config (`~/Library/Application Support/obsidian/obsidian.json`; Linux `~/.config/obsidian/obsidian.json`; Windows `%APPDATA%/obsidian/obsidian.json`) and ask the user to choose one. Resolve both vault name and path; never guess.
3. **Ask options** — project identifier (default current directory basename; `skip` omits `pm`), long-form default folder (`Inbox`), and filename strategy (`title`, `slug`, or `timestamp-title`). Explain that Daily Notes settings remain in Obsidian and quick capture keeps inline tags.
4. **Install templates** — Read `$VAULT_PATH/.obsidian/templates.json`. If missing, tell the user to enable Templates and stop. Empty `.folder` means vault root. Create the folder if needed and copy `${OMP_PLUGIN_ROOT}/templates/task.md`, `doc.md`, and `adr.md` only when each destination is absent. Never overwrite user templates.
5. **Bootstrap skeleton** — If `pm` was not skipped, create `pm/$PROJECT/tasks/archive` and `pm/$PROJECT/docs` with `mkdir -p`, then create `pm/$PROJECT/dashboard.base` from `${OMP_PLUGIN_ROOT}/templates/dashboard-project.base` with `__PROJECT__` substituted. Do not use `overwrite`; an already-existing dashboard is success. These are the only vault filesystem writes; notes and dashboards use the CLI.
6. **Pre-0.9 migration** — Determine whether `pm/$PROJECT` existed before bootstrap and inspect independently:
   - Legacy `archive/`: ask first, list entries, move each note with the Obsidian CLI (never filesystem `mv`), then `rmdir` the old folder. Report moved/failed counts.
   - Missing `title`: ask first; for notes lacking it, set one property per note from the un-kebabbed filename (`implement-auth` → `Implement Auth`). Existing titles and non-kebab filenames remain unchanged. Report counts only.
   - Stale dashboards: ask before replacing; regenerate project and cross-project dashboards with CLI `overwrite` only after confirmation, warning hand edits will be discarded.
   Each migration component may be skipped independently; report only performed work.
7. **Write `.obsidian.yaml`** with the template below, omitting `pm` when skipped.
8. **Offer** adding `.obsidian.yaml` to `.gitignore`.

```yaml
# Obsidian Workspace configuration
vault: <VAULT_NAME>

note:
  default_folder: Inbox
  filename_strategy: title    # title | slug | timestamp-title

pm:
  project: <PROJECT_NAME>
```

Confirm with:

```
.obsidian.yaml created (vault=<NAME>, project=<PROJ>).
Templates installed to <TF>/: task.md, doc.md, adr.md (only the missing ones).
Workspace ready at pm/<PROJ>/: tasks/, docs/, dashboard.base.
Migrated: <N> notes moved to tasks/archive/, <N> titles backfilled, dashboards regenerated. (omit if nothing migrated)

Next:
  /obw-jot <text> — quick capture to today's daily note, or a long-form note
  /obw-pm — task / doc / ADR management
```
