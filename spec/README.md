# Spec

Architecture specs for OMP projects. A spec records an invariant whose violation can remain silent; it is not a second description of the current implementation.

## OMP usage

From the repository root, run the package runner through the plugin root:

```bash
export OMP_PLUGIN_ROOT="$PWD/spec"
"$OMP_PLUGIN_ROOT/scripts/spec.sh" verify
"$OMP_PLUGIN_ROOT/scripts/spec.sh" slice path/to/file
```

When `OMP_PLUGIN_ROOT` is already set by OMP, use its value directly:

```bash
"$OMP_PLUGIN_ROOT/scripts/spec.sh" verify
"$OMP_PLUGIN_ROOT/scripts/spec.sh" slice path/to/file
```

`SPEC_DIR` optionally points at the repository's spec library; otherwise the runner uses `docs/spec`. `verify` reports accepted checks as `PASS` or `FAIL`, skips proposed and superseded entries, and reports prose-only debt without blocking. A missing library exits 2; drift exits 1. `slice` emits only accepted entries whose file-glob scope routes to the requested path.

## Source of truth and dispatch verdicts

The Markdown spec entry is the source of truth for the invariant and its `verify:` binding. A check must validate an observable repository contract, not repeat implementation wording or merely prove that a file contains a phrase. Keep the check beside the invariant in the entry; when the real source of truth is not yet executable, use `verify: null` and state the binding plan in the entry body.

A dispatch verdict is an observed routing result, not a recommendation: record the command or OMP primitive used, the routed scope or path, and the resulting `PASS`, `FAIL`, `SKIP`, or empty slice. Do not manufacture a verdict from prose. If a worker needs the invariant, dispatch the output of `slice` for the files it will touch; the accepted entry and its check remain authoritative.

## Glossary format

The glossary skill keeps one `CONTEXT.md` at the repository root. Read `skills/glossary/references/context-format.md` before writing a glossary entry. Definitions name what a project term is, stay concise, and list overloaded alternatives under `_Avoid_`; general programming terms do not belong there.
