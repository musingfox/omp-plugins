---
name: research
description: Explore the codebase and write a capability inventory for a goal
---

Produce a capability inventory for the given goal. Plan will turn this into behavioral contracts. Facts only.

## Method

1. Broad then narrow: layout / package manifest, then goal-relevant files.
2. Follow imports both ways. Name coupling.
3. Reuse existing patterns; do not invent a second convention.
4. Every capability and constraint cites `file:line`. No file:line → Unresolved.
5. External API / library: `librarian` or official docs first. Tag `[external: source]`. Extract 1–3 facts, never dump docs.
6. UI surface only: note design tokens, component library, existing loading/empty/error patterns.

## Reply

Write the full schema to the `Report path:` from the dispatch prompt. Reply summary-only (verdict + ≤200 words + path).

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
