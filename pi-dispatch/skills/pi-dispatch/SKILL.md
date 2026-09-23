---
name: pi-dispatch
description: >-
  Use when heavy work should be offloaded, fanned out, isolated, or run in the
  background. Dispatch bounded work with OMP task/workpool, choose documented
  agent roles, name work for follow-up, and use hub for waiting, cancellation,
  and persistent process lifecycles without inventing provider-specific APIs.
---

# OMP dispatch

Use OMP primitives as the dispatch control plane. The goal is to keep the main
context focused on a small brief, acceptance evidence, and review while a
worker performs bounded reading or generation. Every dispatched item MUST have
one observable outcome and an artifact or concise structured result that the
caller can inspect.

## Contract mapping

| Need | OMP-native operation | Contract |
| --- | --- | --- |
| Dispatch one worker | `task` with one task payload | Give the worker a complete brief, scope, output path/shape, and acceptance check. Use `awaitCompletion` only when the caller must block. |
| Dispatch a fan-out | `task` with `context` and a `tasks` array | Each item is self-contained. Do not make one item depend on another item's unwritten context. Gather all results before review. |
| Choose a worker role | `agent` model role in the task/agent request | Use only roles that are documented and available in the current OMP installation (for example `task`, `scout`, or `reviewer`). A role is a behavior contract, not a provider or model pin. |
| Name a worker | `name` on a `task` item or explicit process name in `hub start` | Names are for correlation and follow-up through the returned OMP job/process handle; they do not create a durable registry. |
| Wait for completion | completion handles plus `hub` wait, or `awaitCompletion: true` | Prefer one wait over a polling loop. Keep the handle/job id beside the brief and map results by name. |
| Observe a live run | `hub` process/log APIs when a process was started there | Use `hub logs` or `hub wait` for the named process. Do not parse private worker transcripts as an output contract. |
| Cancel work | `agent.cancel()` for an agent handle, or `hub cancel`/`hub stop` for a documented job/process | Cancel by the returned handle or id. Cancellation is idempotent from the caller's perspective; report partial artifacts as untrusted. |
| Isolate work | `isolated: true` on `task`/`agent`, or a dedicated work directory explicitly supplied in the brief | Isolation is an OMP runtime boundary, not a promise that edits are mergeable. Review the resulting artifacts/diff before accepting them. |
| Reuse many independent items | `workpool` | Push independent items, inspect status/results, and close the pool. Keep item prompts and output contracts stable so results remain attributable. |

Do not substitute shell loops, ad-hoc background processes, or another agent
framework for these operations. If a long-lived external process is genuinely
required, start it only through the documented `hub` process API and retain its
returned name; use `hub logs`, `hub wait`, `hub send`, `hub restart`, or `hub
stop` as appropriate.

## Brief shape

A good brief is executable without a second conversation:

```text
Outcome: <one observable result>
Scope: <files, URLs, or bounded question>
Constraints: <what must not be changed>
Isolation: <isolated=true, or the explicit work directory>
Artifact: <absolute or unambiguous path, or structured result schema>
Acceptance: <command/check and the evidence it must produce>
Return: <short summary plus artifact path; no transcript dump>
```

For a write task, require the worker to run its acceptance check before
claiming success and to write a durable artifact. A useful one-line result is
`STATUS=DONE <check and exit code>` or `STATUS=BLOCKED <missing prerequisite>`.
The parent still reviews the diff and independently reruns the check when the
change matters. A successful process exit alone is not proof of completion.

## Dispatch patterns

### One bounded task

Use a single `task` request when the work is small or has shared context. Set
`isolated: true` when the worker may edit files and the parent needs a clean
boundary. Keep the result in the returned handle; do not ask the worker to
restate all source material in the parent conversation.

### Parallel fan-out

Decompose first, then submit one `task` call with a `tasks` array (or push
items into a `workpool`). Each item MUST own a disjoint scope or be read-only.
Use completion handles and `hub` wait to join the wave. Only after every item
settles should the parent synthesize, review, or launch a dependent task.

```text
context: Execute only the supplied work items; return the named artifact.
tasks:
  - label: inspect-api; isolated: true; brief: ...
  - label: inspect-tests; isolated: true; brief: ...
```

### Follow-up work

OMP does not provide a cross-round workdir/session resume contract for a
completed task. To continue, dispatch a new task and pass the prior artifact,
diff, or durable report path explicitly in its brief. Never claim that a new
worker remembers the previous worker's hidden context.

### Persistent process

For a worker that must remain alive independently of the current turn, use
`hub start` with a real executable and arguments, then address the returned
process name with `hub logs`, `hub wait`, `hub send`, and `hub stop`. State the
external executable and authentication/configuration prerequisites in the
brief. Do not invent a worker daemon, registry, or resume protocol around it.


## Model and provider limits

OMP dispatch selects an OMP agent role / model-role alias, not a provider pin.
Dispatch MUST use documented model-role aliases and MUST NOT claim arbitrary PI environment pinning, vendor pricing, or a cheap-model guarantee. If a task needs a capability, express it as a role and acceptance check (for example `reviewer` for independent review), and stop or replan when that role is unavailable.

Likewise, `isolated: true` is the only isolation guarantee made here. It does
not imply git worktrees, automatic merge, filesystem snapshots, or rollback.
Declare an explicit work directory when file location matters and inspect the
result before merging. Any required external command must be listed as a
prerequisite; dispatch must not pretend that it is installed.

## Safety and completion

- Keep prompts narrow; never dispatch secrets or unnecessary source material.
- Give each worker a unique artifact path when multiple workers write results.
- Treat missing output, cancellation, timeout, or a `BLOCKED` result as a
  dispatch failure requiring review, not as success.
- Cancel abandoned work and close workpools after consuming their results.
- The parent owns final integration, user communication, and acceptance.
