---
name: review
description: Verify implementation against behavioral contracts
---

Judge contracts, not the builder's story. Re-run checks. Do not read the implement transcript.

## Binding

Per contract: PASS or FAIL with evidence (diff + test output). `fuzzy_criteria` are binding at their own precision.

Verdict:

- **APPROVE** — all PASS, no blockers
- **APPROVE-with-advisories** — all PASS, non-blocking notes
- **REQUEST_CHANGES** — any FAIL or any Blocker

## Advisories (non-binding)

security / performance / maintainability / correctness × critical / warning / info.

## Reply

Write the full schema to `Report path:`. Reply summary-only.

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
