# Docs

This directory keeps project knowledge close to the code.

## Naming

- All directories and markdown filenames under `docs/` use kebab-case (matching compound-engineering conventions). `README.md` filenames are the only exception — kept as-is for discoverability.
- Prefer focused markdown files; split when a domain grows; keep `README.md` as the local index.

## Indexing

- When adding, renaming, splitting, moving, or archiving docs, update the nearest relevant `README.md` in the same change.

## Map

- `api/` — CCC tailor contract mirror used by this BFF (see [api/API.md](./api/API.md)).
- `arch/` — frontend architecture and BFF invariants.
- `plans/` — compound-engineering plan artifacts. [plans/README.md](./plans/README.md) is the milestone north-star.
- `solutions/` — institutional learnings (bugs, best practices, workflow patterns).
- `brainstorms/` — `/ce-brainstorm` artifacts.
- `ideation/` — `/ce-ideate` ranked directions.
- `residual-review-findings/` — deferred CE review leftovers.
- `spec/` — product behavior / UI contracts when they outgrow a plan.
- `test/` — test strategy notes.
- `archive/` — local historical notes (gitignored by default).

Companion CCC docs (Master CV, inbox, smoke, curator prompts) stay in that repo unless intentionally mirrored here.
