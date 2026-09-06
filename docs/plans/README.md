# Plans

North-star for **ccc-frontend**: operator surfaces on the same CCC tailor API.
Gmail inbound drafts live in the CCC repo. This repo is the on-demand UI and, next, application tracking.

`STRATEGY.md` in CCC owns product thesis. This README owns **frontend build order**.

## Active milestone

**M1 — On-demand tailor UI** (`in progress`)

Paste a JD, server-side Bearer call to CCC, download `.docx`, read `replyText`.

Plan: [on-demand tailor UI](./2026-09-06-001-feat-ondemand-tailor-ui-plan.md)

## Milestones (build order)

| # | Milestone | Status | Plan | Unblocks | Lane |
|---|-----------|--------|------|----------|------|
| M1 | On-demand tailor UI (paste JD → CV + reply) | in progress | [on-demand tailor UI](./2026-09-06-001-feat-ondemand-tailor-ui-plan.md) | Sync second front | lfg |
| M2 | Kanban job tracker (applied roles) | not started | needs plan | Visible pipeline of applications | lfg |
| M3 | Gantt / timeline of applications | not started | needs plan | Date-aware view of the same jobs | parked |
| M4 | Automated nudges / follow-ups | not started | needs plan | Reminders without a new tracker | parked |

## How to update

- Drain-style: one `/lfg` per `lfg` row. Next after M1 is **M2 Kanban**.
- Gantt and nudges stay `parked` until Kanban exists (they extend the same job records).
- Do not put `TAILOR_API_KEY` in the browser.
