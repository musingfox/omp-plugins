---
name: survey
description: >-
  Survey a codebase for deepening opportunities — shallow modules, leaking
  seams, and interfaces hard to test through — then hand candidates as a
  Markdown and Mermaid report.
---

# Survey

Survey adapted from [mattpocock/skills](https://github.com/mattpocock/skills) `improve-codebase-architecture` (MIT, Copyright (c) 2026 Matt Pocock), commit 3cca18b368ae95cdbdebbff572ccafa662551015. The upstream HTML report and grilling steps are not imported: viz renders Markdown/Mermaid, and the main session narrows a candidate.

Plugin root is this skill's package directory. Set `OMP_PLUGIN_ROOT` to that directory if it is unset before resolving package resources.

## 1. Scope

If `$ARGUMENTS` is non-empty, use that string as the scope and skip hotspot inference. Tell the user the chosen scope in one line before doing anything else.

Otherwise run from the repository root:

```bash
bash "${OMP_PLUGIN_ROOT}/scripts/hotspots.sh"
```

Read its `scope:` line. For `scope: hotspot`, use the ranked paths (top three). For `scope: wide`, survey the whole tree and retain the ranked list as hints. If `window` is below 10 or the log is empty, say history is thin in the one-line scope message. If the script exits 1 because this is not a git repository, stop and use `ask` in plain prose for a direction.

## 2. Context

Before dispatch, read `CONTEXT.md` if present and ADRs under `docs/adr/`. They constrain candidates.

## 3. Explore

Print the scope and explorer count. Dispatch one isolated `task` per scope path (or one for the whole tree), in one message, never more than three. Each task must carry this envelope:

```text
Report path: /tmp/viz/<project>/deepen-explorer-<timestamp>-<n>.md
Scope: <path or whole tree>
```

Use `${OMP_PLUGIN_ROOT}/agents/explorer.md` as the contract. The report path is an artifact destination; timestamp it so stale reports cannot be used. Wait for all tasks via `hub` completion handles before reading (never run a real task in contract tests). If a report is missing, say which scope produced nothing and continue.

## 4. Read

For each report, use `read` to retrieve only its `## Summary` and `## Friction`
sections; never retrieve `## Notes`.

## 5. Report

Write the candidate report yourself, following `${OMP_PLUGIN_ROOT}/docs/report.md`, to `/tmp/viz/<project>/deepen-survey-<timestamp>.md`. Do not propose interfaces. If all explorers report zero friction, put `No candidates` under `## Top recommendation`, name the scope, and still render.

## 6. Render

```bash
bash "${OMP_PLUGIN_ROOT}/scripts/render-survey.sh" /tmp/viz/<project>/deepen-survey-<timestamp>.md
```

The script uses sibling viz when available and otherwise prints the report inline. Print the report path.

## 7. Hand-off

Use `ask` to ask: “Which of these would you like to explore?” Narrowing a chosen candidate is the main session's job; this skill ends at the report.
