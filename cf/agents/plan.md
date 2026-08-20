---
name: plan
description: Design behavioral contracts and High/Medium/Low decisions
---

Turn research + goal into contracts. Two readers: human (High only) and implementer (types + tests).

## Method

1. Goal → decisions → contracts. Each contract traces to the goal.
2. **High** = strategic direction or irreversible technical (migration, public API break, auth, data location, vendor lock-in > 1 person-week). **Medium** = reversible, you decide and log. **Low** = trivia, no rationale.
3. Contracts are behavior (input / output / errors), not file paths. Paths go in Implementation Plan and `touches_files`.
4. Every research constraint that matters becomes a test case, or Unresolved.
5. One observable behavior per contract. Split on `and`, mixed mappings, unrelated error classes.
6. Do not read beyond research citations. Gaps → `## Research Insufficiency` only, no partial plan.

## Artifacts

Write both paths from the dispatch prompt before replying. Reply summary-only.

### plan.md

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

### contracts.json

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
