# Dispatching a sub-contract

A sub-node is a `task` subagent you spawn. This file says what a node adds to the `task` tool's own description.

## The ticket carries contracts.json verbatim

Build the ticket as a file and point the `task` assignment at it: the assignment is one line, "Read the ticket at `<abs path>` and follow it", plus the report path. Assemble the file with `cat`, never by retyping: a retyped contract is a second copy that drifts from the one the gates and the review read.

A ticket file holds, in order:

1. **A head you write**: the goal this sub-contract serves in your contract, the base commit, the full test command (it must pass in an isolated clone with no live services, shared ports or external daemons), the load-bearing assumptions it rests on with their receipts, the branch and worktree it builds in (below), and the line telling the node to read the method skill (`skill://method`, or `<plugin root>/skills/method/SKILL.md` by absolute path).
2. **The contracts**, `cat` of the sub-node's `contracts.json`, inside a fence labelled `contracts.json`. The node writes it back out to a file for the gates.
3. **The report shape**, `cat` of `<plugin root>/skills/method/report.md`, so every node reports the same way whatever it loaded.

Every `task` item also needs `solutionSpace`: say whether the sub-contract fixes the design or leaves choices open.

## Where a sub-node builds

A sub-node that changes code builds on a branch of its own, so its author can review it before merging. The ticket names the branch, `method/<contract-name>`, and has the node create its own worktree for it (`git worktree add -b <branch> <dir> <base>`) and commit there.

`isolated: true` on a `task` item is not that worktree. The field exists only while `task.isolation.enabled` is on (default off), and with `task.isolation.apply` at its default a successful task's changes are applied to your checkout automatically, which skips the review before merge. Use it only for a sub-node whose changes you would merge unreviewed.

## Nested dispatch

A sub-node that splits again dispatches its own sub-nodes with `task`, the same way. `task.maxRecursionDepth` (default 2) caps how deep subagents may spawn; a split that would pass it is reported up as `BLOCKED`, kind decision, rather than flattened.

A middle node points each leaf's worktree at **its own** branch's repository and merges the leaf branches into its own branch. Its branch is then the whole result one layer up.

Independent sub-contracts start together, as items of one `task` call; one with a `depends` starts after the branch it consumes is merged, from that merge as its base. When `task` returns job ids instead of results, call `wait` until every result has arrived before you read any of them.

## Agent seats

Review, probe, prototype and divergence are agents: each needs a context of its own. Dispatch them with `task`, `agent:` set to `method-review`, `method-probe`, `method-prototype` or `method-divergence`; put the inputs the seat's definition names in `task`. Merge nothing from a seat: read its report and its files only.

## An information session

For `route.md`'s one information round, dispatch the cheapest seat that can answer: the `scout` agent. Its task is the question and the files to look in; it writes code nowhere.

Done: every dispatched sub-node has a ticket file built from `cat`, a `task` name you recorded, and a result read back.
