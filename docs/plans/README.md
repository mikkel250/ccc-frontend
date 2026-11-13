# Plans

North-star for **ccc-frontend**: operator surfaces on the same CCC tailor API.
Gmail inbound drafts live in the CCC repo. This repo is the on-demand UI and application tracking.

`STRATEGY.md` in this repo covers frontend scope; companion CCC `STRATEGY.md` owns overall product thesis. This README owns **frontend build order**.

## Active milestone

**M2 — Kanban job tracker** (`in progress`)

Accounts in Postgres, session-gated tailor, and a four-column board of applied roles.

Plan: [Kanban job tracker](./2026-09-06-002-feat-kanban-job-tracker-plan.md)

## Milestones (build order)

| # | Milestone | Status | Plan | Unblocks | Lane |
|---|-----------|--------|------|----------|------|
| M1 | On-demand tailor UI (paste JD → CV + reply) | shipped | [on-demand tailor UI](./2026-09-06-001-feat-ondemand-tailor-ui-plan.md) | Sync second front | done |
| M2 | Kanban job tracker (applied roles) | in progress | [Kanban job tracker](./2026-09-06-002-feat-kanban-job-tracker-plan.md) | Visible pipeline of applications | lfg |
| M3 | Gantt / timeline of applications | not started | needs plan | Date-aware view of the same jobs | parked |
| M4 | Automated nudges / follow-ups | not started | needs plan | Reminders without a new tracker | parked |

## Follow-up plans

These sit outside the milestone table. Drain skips them.

| Plan | When |
| --- | --- |
| [Tailor hardening test gaps](./2026-11-10-1737-test-tailor-hardening-test-gaps-plan.md) | Hardening is on main (PR #5) |

## How to update

- Drain-style: one `/lfg` per `lfg` row. Next after M2 is **not** M3 until Kanban ships and is unparked.
- Gantt and nudges stay `parked` until Kanban exists (they extend the same job records).
- Do not put `TAILOR_API_KEY` in the browser.
