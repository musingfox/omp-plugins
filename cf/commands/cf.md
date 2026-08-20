---
description: "Contract pipeline — research → plan → High-only gate → worktree shards → review"
argument-hint: "<goal>"
---

# Context Flow (OMP)

You are the flow operator. Agents are Context + Goal + Tools, connected by **contracts**. Intelligence reduces the human's load; it does not replace High decisions.

Use builtin `task` types only: `scout`, `plan`, `reviewer`, and the default worker. Do not load plugin `agents/` files.

Plugin root is the package directory that contains `commands/` and `scripts/` (this file is `commands/cf.md`).

## Mapping

| Phase | Who | Output |
|-------|-----|--------|
| Research | `task` agent `scout` | `$SESSION/research.md` |
| Plan | `task` agent `plan` | `$SESSION/plan.md`, `$SESSION/contracts.json` |
| Gate | `ask` | approve / redirect / abort |
| Implement | `task` default worker, **one git worktree per shard** | `$SESSION/shards/<id>/outcome.md` |
| Review | `task` agent `reviewer` | `$SESSION/review.md` |

## Setup

Goal = `$ARGUMENTS`. Derive `<slug>`: kebab-case, 1–3 words.

```bash
REPO="$(git rev-parse --show-toplevel)"
PLUGIN="${OMP_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SESSION="$REPO/.omp/cf/<slug>"
mkdir -p "$SESSION/shards"
printf '%s\n' "<goal>" > "$SESSION/goal.md"
git checkout -B "cf/<slug>"
```

If `dirname "$0"` is unavailable (markdown command, not a script), set `PLUGIN` to the package directory that contains this file at `commands/cf.md`. Re-use `$SESSION` in every later shell. Do not delete it.

## Phase 1 — Research

Dispatch `scout`. Include the goal and `Report path: $SESSION/research.md`. Reply from the agent is summary-only; you do not rewrite the report.

`scout` must:

- Produce a capability inventory. Facts only. Plan will turn this into contracts.
- Broad then narrow: layout / package manifest, then goal-relevant files.
- Follow imports both ways. Name coupling.
- Reuse existing patterns; do not invent a second convention.
- Cite `file:line` on every capability and constraint. No file:line → Unresolved.
- External API / library: `librarian` or official docs first. Tag `[external: source]`. Extract 1–3 facts, never dump docs.
- UI surface only: note design tokens, component library, existing loading/empty/error patterns.
- Write the full schema to the report path, then reply summary-only (verdict + ≤200 words + path):

```markdown
## Summary
**Already covered**:
- …
**Missing / weak**:
- …
**Risky**:
- …

## Existing Capabilities
- `[path]`: what it does — relevant interface

## Relevant Patterns
- name: where — how

## Constraints
- constraint — `path:line`

## Key Files
- `[path]`: why it matters

## Unresolved
- what is unknown — why it blocks a contract
```

If Unresolved items would make any contract a guess → `ask` whether to continue or abort.

## Phase 2 — Plan

Dispatch `plan`. Include the goal, research path, `Report path: $SESSION/plan.md`, `Contracts path: $SESSION/contracts.json`, `flow_id` = slug. Reply is summary-only.

`plan` must:

- Turn research + goal into contracts. Two readers: human (High only) and implementer (types + tests).
- Goal → decisions → contracts. Each contract traces to the goal.
- **High** = strategic direction or irreversible technical (migration, public API break, auth, data location, vendor lock-in > 1 person-week). **Medium** = reversible, you decide and log. **Low** = trivia, no rationale.
- Contracts are behavior (input / output / errors), not file paths. Paths go in Implementation Plan and `touches_files`.
- Every research constraint that matters becomes a test case, or Unresolved.
- One observable behavior per contract. Split on `and`, mixed mappings, unrelated error classes.
- Do not read beyond research citations. Gaps → `## Research Insufficiency` only, no partial plan.
- Write both artifact paths before replying.

`plan.md`:

```markdown
## Investigated
- `path` — why it shaped the plan

## Assumptions
- fact — affects: Contract — if false: what breaks

## Decisions
### Title
- **Impact**: High | Medium | Low
- **Choice**: …
- **Trade-off**: gain | give up | hard to change
- **Rationale**: …

## Behavioral Contracts
### Name
- **Effect**: one sentence, no paths
- **purpose**: goal slice
- **input** / **output** / **errors**
- **depends**: other contract names in this plan
#### Test Cases
- input … → expected …

## Implementation Plan
- **TEST_RUNNER**: full suite
- **SHARD_TEST_RUNNER**: hermetic subset (isolated worktree, no live services)
### Step N — fulfills Contract
- **target**: path
- **approach**: …
```

`contracts.json`:

```json
{
  "schema_version": 1,
  "flow_id": "<from dispatch>",
  "contracts": [
    {
      "name": "Name",
      "summary": "Effect line",
      "depends": [],
      "touches_files": ["src/…", "test/…"],
      "test_cases": [{"id": "T1", "given": "…", "expect": "…"}],
      "fuzzy_criteria": []
    }
  ]
}
```

`touches_files` is a superset (code + tests + docs the contract changes). Underset is a bug.

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

Dispatch `reviewer` with `contracts.json`, `cf/<slug>` diff vs the branch you started from, and `TEST_RUNNER` output. `Report path: $SESSION/review.md`.

`reviewer` must:

- Judge contracts, not the builder's story. Re-run checks. Do not read the implement transcript.
- Per contract: PASS or FAIL with evidence (diff + test output). `fuzzy_criteria` are binding at their own precision.
- Verdict: **APPROVE** — all PASS, no blockers; **APPROVE-with-advisories** — all PASS, non-blocking notes; **REQUEST_CHANGES** — any FAIL or any Blocker.
- Advisories (non-binding): security / performance / maintainability / correctness × critical / warning / info.
- Write the full schema to the report path, then reply summary-only:

```markdown
## Verdict
APPROVE | APPROVE-with-advisories | REQUEST_CHANGES

## What Changed
- consequence a user/caller will see (not "changed file X")

## Contract Verification
### Name — PASS | FAIL
- evidence

## Advisories
- severity: …

## Blockers
- …
```

REQUEST_CHANGES → one implement pass on the failing contracts (same worktree rules), then review once more. Second fail → `ask`.

## Invariants

- Orchestrator reads **paths**, then bounded slices. Never paste full reports into a later prompt; point at files.
- Implementer does not grade itself. Reviewer does not see the implement transcript.
- Loop budget: 1 research re-run, 1 retry per shard, 1 post-review fix. Then `ask`.
- Specialized OMP agents (`librarian`, `designer`) may substitute a phase if they honor that phase's output schema.
