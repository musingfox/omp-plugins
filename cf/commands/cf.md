---
description: "Contract pipeline — research → plan → High-only gate → worktree shards → review"
argument-hint: "<goal>"
---

# Context Flow (OMP)

You are the flow operator. Agents are Context + Goal + Tools, connected by **contracts**. Intelligence reduces the human's load; it does not replace High decisions.

Skip: pi-dispatch, `cf-pi-*.sh`, Agent Teams, Monitor, Claude implement fallback.

## Mapping

| Phase | Who | Output |
|-------|-----|--------|
| Research | `task` agent `scout` | `$SESSION/research.md` |
| Plan | `task` agent `plan` | `$SESSION/plan.md`, `$SESSION/contracts.json` |
| Gate | `ask` | approve / redirect / abort |
| Implement | `task` default worker, **one git worktree per shard** | `$SESSION/shards/<id>/outcome.md` |
| Review | `task` agent `reviewer` | `$SESSION/review.md` |

Load agent prompts from `${OMP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/agents/{research,plan,review}.md`.

## Setup

Goal = `$ARGUMENTS`. Derive `<slug>`: kebab-case, 1–3 words.

```bash
REPO="$(git rev-parse --show-toplevel)"
PLUGIN="${OMP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}"
SESSION="$REPO/.omp/cf/<slug>"
mkdir -p "$SESSION/shards"
printf '%s\n' "<goal>" > "$SESSION/goal.md"
git checkout -B "cf/<slug>"
```

Re-use `$SESSION` in every later shell. Do not delete it.

## Phase 1 — Research

Dispatch `scout` with the research agent prompt + goal. `Report path: $SESSION/research.md`. Reply is summary-only; you do not rewrite the report.

If Unresolved items would make any contract a guess → `ask` whether to continue or abort.

## Phase 2 — Plan

Dispatch `plan` with the plan agent prompt + goal + research path. `Report path: $SESSION/plan.md`. `Contracts path: $SESSION/contracts.json`. `flow_id` = slug.

If the agent returns Research Insufficiency, loop research once, then `ask`.

## Human gate

Only **High** decisions. Medium/Low stay in plan.md.

Present, then `ask`:

1. TL;DR (≤3 lines: scope, reversibility, recommendation)
2. What will change (user/caller consequences, grouped by Effect)
3. High decisions (if any) — choice, trade-off, why they must decide
4. Confirm checklist

Options: Approve as-is · Approve with direction · Abort.

**No High and no irreversible scope** → still `ask` once for scope confirmation. Do not start worktrees before this returns.

## Phase 3 — Shards + worktrees

After Approve:

```bash
python3 "$PLUGIN/scripts/shard.py" "$SESSION/contracts.json" > "$SESSION/shards.json"
```

For each shard id in each `waves[]` entry (one `task` batch per wave; never serialize independent shards):

```bash
git worktree add -b "cf/<slug>/<id>" "$SESSION/wt-<id>" "cf/<slug>"
```

Worker prompt MUST include:

- `WORK: $SESSION/wt-<id>` (absolute). All source edits stay in `$WORK`.
- The shard's contracts from `contracts.json` (names listed in `shards.json`).
- `SHARD_TEST_RUNNER` from plan.md.
- `Outcome path: $SESSION/shards/<id>/outcome.md` — write this, then reply `DONE`.

Outcome file, one of:

```
STATUS=PASS
STATUS=FAIL <reason>
STATUS=NEEDS_REPLAN <undeclared file or contract contradiction>
```

Worker runs `SHARD_TEST_RUNNER` inside `$WORK` before claiming PASS. You re-run it; do not trust the file alone.

Routing: PASS → next wave. FAIL → retry that shard once (same worktree). NEEDS_REPLAN or second FAIL → `ask` (replan / skip / abort).

After a wave of PASS, merge each shard branch into `cf/<slug>` (`git merge --no-ff`). File-overlap shards should not conflict; conflict → `ask`. Then run `TEST_RUNNER` on `cf/<slug>`. Failure → `ask`.

Leave worktrees until the human says to drop them:

```bash
git worktree remove "$SESSION/wt-<id>"
```

Do not merge `cf/<slug>` to the default branch.

## Phase 4 — Review

Dispatch `reviewer` with the review agent prompt, `contracts.json`, `cf/<slug>` diff vs the branch you started from, and `TEST_RUNNER` output. `Report path: $SESSION/review.md`.

REQUEST_CHANGES → one implement pass on the failing contracts (same worktree rules), then review once more. Second fail → `ask`.

## Invariants

- Orchestrator reads **paths**, then bounded slices. Never paste full reports into a later prompt; point at files.
- Implementer does not grade itself. Reviewer does not see the implement transcript.
- Loop budget: 1 research re-run, 1 retry per shard, 1 post-review fix. Then `ask`.
- Specialized OMP agents (`librarian`, `designer`) may substitute a phase if they honor that phase's output schema.
