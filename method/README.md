# Method

[Experimental] One skill that teaches a session to act as one **node** of a contract tree: take a contract from the layer above, deliver it itself or split it into sub-contracts it writes, dispatch them, route what comes back, and report up in a fixed shape. A question that is not yet a contract is narrowed into one first. `skills/method/SKILL.md` is the entry and links the rest.

Ported from cc-plugins `method` at `b4555826` (`package.json` `omp.upstream`).

## Contents

| Piece | Purpose |
|-------|---------|
| `skills/method/` | The method itself: narrowing, do-or-split, writing `contracts.json`, dispatching, reporting, routing, and the one review per split. Read `SKILL.md` first. |
| `agents/method-review.md` | Verifies a builder's diff against the contracts on the Spec axis. Each FAIL and Blocker carries a layer (code, contract or milestone), and each advisory a repro command. |
| `agents/method-divergence.md` | Narrowing's widening seat: names the distinct directions a layer could go and what each commits to. Never sees the node's hypotheses. |
| `agents/method-probe.md` | Walks ONE candidate direction shallowly, only to find what it collides with. |
| `agents/method-prototype.md` | Builds and runs ONE throwaway thing to answer a question reading could not, on a branch nobody merges. |
| `scripts/check-contracts.sh` | Checks a `contracts.json` against the schema in `skills/method/contracts.md`. `check-contracts.sh FILE`; silent and exit 0 when clean, one line per violation and exit 1, exit 2 on unusable input. |

## Not yet ported

These cc pieces are stubs here; the skill says to skip a step that needs one and name the skip in its report.

- **The decision page** (`render-decision.sh`, `wait-decision.sh`, `decision-page.md`). Every round and the depth gate are asked inline with `ask`.
- **Background wake-up** for a page left waiting on the human. Not needed while rounds are inline.
- **The gates**: `scope-gate.sh`, `revert-gate.sh`, `add-repros.sh` and their tests.

## How it maps onto OMP

- Agent seats are dispatched with `task` and `agent: method-<seat>`. OMP has no `plugin:` namespace and keeps the first agent of a name it loads, so the seats carry a `method-` prefix.
- Seats set `thinkingLevel:`, not `effort:`, which OMP does not read. They pin no `model:`; pin the reviewer at or above the builder with `task.agentModelOverrides`.
- Sub-nodes are `task` subagents that build on their own branch and worktree; nested splits recurse through `task`, up to `task.maxRecursionDepth`.
- `ask` never gets a `recommended` index: with `ask.timeout` set, silence would auto-pick it. `skills/method/narrow.md` "Asking with `ask`" gives the rule.

## Tests

`bash method/tests/run.sh`

## Requirements

- `bash`
- `jq`
- `git`
