---
name: adr
description: >-
  Use when the user asks to write or record a decision, create/list/supersede/deprecate
  an ADR, audit decisions, or refers to docs/decisions, docs/adr, adr, or MADR files.
  Manages MADR 4.0 Architecture Decision Records with directory detection, four-digit
  numbering, lifecycle transitions, and cross-reference consistency. Use spec for a
  rule that must hold across runs; use obw project-note ADR for project notes, not
  this repository ADR lifecycle.
---

# ADR Lifecycle Management

Manage repository Architecture Decision Records in MADR 4.0 format. An ADR records
why a consequential choice was made; it is historical once accepted. This skill is
separate from `obw` project-note ADRs: do not create an obw note when managing this
repository's numbered ADR files, and do not treat an obw note as part of this ADR
index. Use `spec` for an invariant or forward-looking contract rather than a past
choice.

Do not use this skill for casual architecture discussion or direct editing of one ADR
when no lifecycle operation is requested.

## Directory detection

Scan in order and use the first directory containing numbered ADRs (or an existing
empty directory when the user explicitly chose it):

1. `docs/decisions/`
2. `docs/adr/`
3. `adr/`
4. `decisions/`

Use the equivalent glob `{docs/decisions,docs/adr,adr,decisions}/[0-9][0-9][0-9][0-9]-*.md`.
If none exists for creation, use the OMP ask interaction to ask where to create it.

## MADR format and numbering

Each file is `NNNN-kebab-case-title.md`, with a four-digit zero-padded number. Read
`references/madr-template.md` before creating a normal ADR. Frontmatter is:

```yaml
---
status: proposed
date: YYYY-MM-DD
decision-makers: ""
---
```

Statuses are `proposed`, `accepted`, `deprecated`, or `superseded by
[ADR-NNNN](file)`. Read `references/bootstrap-adr.md` for the first-use file.

## Decision warrant

Before creating a normal ADR, apply the three-condition warrant test: the decision is
hard to reverse, confusing without context, and involved a genuine trade-off with
alternatives. If any condition fails, name the failed condition and where the
information belongs instead (`spec` for a constraint, or ordinary documentation for
cheap/self-evident context), then stop unless the user reaffirms. The bootstrap ADR
is exempt because it records the format. Do not restate this test in every operation.

## Create

1. Apply the warrant test; stop on a failed condition unless reaffirmed.
2. Detect the directory, asking with OMP ask if none exists.
3. If there are no numbered ADRs, create `0000-use-madr.md` from the bootstrap
   reference, substituting today's date.
4. Scan numbered files and choose the next number (highest existing number + 1).
5. Convert the title to a kebab-case filename, read the MADR template, fill today's
   date and user-provided content, and write the file.
6. Search existing ADR titles for keyword overlap and suggest related records.
7. Present the created path and number.

## List

Glob all numbered ADR files. Read each frontmatter and first level-one heading and
present a table with number, title, status, and date. Show supersession chains such
as `0001 -> 0003`, then summarize counts by accepted, proposed, superseded, and
deprecated. Do not include obw project-note ADRs.

## Supersede

Execute all steps in order:

1. Resolve the requested number (`ADR-3`, `ADR-0003`, `ADR 3`) to its numbered file,
   read its status and title, and warn if it is already superseded.
2. Create the replacement through the Create flow. If the replacement fails the
   warrant, deprecate the old record instead; do not manufacture a supersession.
3. Add `Supersedes [ADR-NNNN](old-file.md)` in the replacement's More Information.
4. Change the old status to `superseded by [ADR-NNNN](new-file.md)` and insert this
   callout after frontmatter and before the first heading:

   `> **SUPERSEDED**: This ADR has been superseded by [ADR-NNNN: New Title](new-file.md). The decision described here is no longer in effect.`

5. Scan the whole repository for references to the old record using all four layers:
   old filename; `ADR[-\s]?0*N\b`; markdown links containing the old number; and the
   exact old title in `.md` files. Exclude the old/new files and `node_modules/`,
   `.git/`, `target/`, `dist/`, `build/`, `vendor/`, `.agents/`.
6. Categorize matches as other ADRs, documentation, source comments, or config. Use
   OMP ask per category to choose auto-update, add a superseded notice, or skip.
   Auto-update ADR links/status and documentation links; add notices as
   `(superseded — see [ADR-NNNN](path))`; skip config by default unless selected.
7. Report created and superseded records plus counts and skipped paths needing review.

## Deprecate

Resolve the record and verify it is not already deprecated or superseded. Change its
status to `deprecated`, then insert before its first heading:

`> **DEPRECATED**: This ADR is deprecated. The decision described here is no longer relevant.`

Run the same four-layer scan and category presentation as Supersede, but default to
adding `(deprecated)` notices. Use OMP ask per category to add notices or skip.
Report the deprecated record and all updates/skips.

## Audit

Run every check and group output by severity; never silently edit on audit findings.

**ERRORS (must fix)**

- Broken links: every markdown link to `NNNN-*.md` must resolve to an existing ADR.
- Circular supersession: follow status links and report cycles such as A -> B -> A.

**WARNINGS (should fix)**

- Stale references: references to superseded ADRs without a supersession notice,
  using the same four-layer scan.
- Missing frontmatter: numbered ADR lacks `status` or `date`.
- Orphaned supersession: a record points to a replacement whose More Information
  lacks the reciprocal `Supersedes` reference.

**WARRANT (judgment; never auto-act)**

For every proposed or accepted non-bootstrap, non-superseded, non-deprecated ADR,
inspect the options, context/problem, consequences, and outcome rationale. Report
`[unwarranted]` with the failed warrant condition when there are fewer than two real
options, the choice is ordinarily reversible without migration/data loss/external
commitment, or the rationale merely restates the choice. Suggest deprecating rather
than superseding; the user decides and the ADR is never edited automatically.

**INFO**

- Supersession chains of three or more links; suggest simplification.
- Numbering gaps; informational only.

Use this output shape:

```text
ADR Audit:

ERRORS (N):
  [broken-link] docs/setup.md:15 links to 0009-missing.md — file does not exist
  [circular] ADR-0003 -> ADR-0007 -> ADR-0003

WARNINGS (N):
  [stale-ref] README.md:42 references ADR-0003 (superseded by ADR-0007)

WARRANT (N):
  [unwarranted] ADR-0005: Use Prettier — no trade-off — suggest deprecate

INFO (N):
  [gap] Missing numbers: 0004, 0006

Summary: N errors, N warnings, N unwarranted, N info
```

If errors or warnings exist, suggest supersede or manual fixes. Warrant findings are
for user judgment only.
