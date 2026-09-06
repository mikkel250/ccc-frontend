# Residual Review Findings

**Branch:** `lfg/m2-kanban`  
**HEAD at filing:** `5228796`  
**Review run:** `/tmp/compound-engineering-501/ce-code-review/20260906-135442-d5aebc65`  
**Plan:** `docs/plans/2026-09-06-002-feat-kanban-job-tracker-plan.md`

Applied in `fix(review): apply review findings`: first-user after-hook plus adapter transactions, Prisma/board error paths, `updateMany` not-found, auth form/sign-out failure UI, CCC 401/403 remapped to 502, date-only `appliedAt`, and the missing registration/jobs/tailor tests.

## Residual Review Findings

- P2 `lib/jobs.ts:181` Parallel card creates collide on position — [issue #1](https://github.com/mikkel250/ccc-frontend/issues/1)
- P2 `lib/jobs.ts:119` JobsStore cast erases Prisma write types — [issue #2](https://github.com/mikkel250/ccc-frontend/issues/2)

Not filed (residual risks / deferred product): Postgres RLS, CCC fetch timeout (pre-existing on the tailor proxy), unique `(userId, status, position)` until a later migration, Better Auth origin must match the browser URL.
