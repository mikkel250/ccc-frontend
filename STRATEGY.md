---
name: ccc-frontend
last_updated: 2026-09-06
---

# ccc-frontend Strategy

## Target problem

Same as companion CCC: in-demand professionals get more recruiter inbound than they can answer honestly. This repo is the **sync / on-demand** front — paste a JD when you are sitting at the keyboard — plus future application tracking.

## Our approach

One CCC tailor API (`POST /api/tailor-cv`), two presenters:

1. **Inbox worker** (CCC repo) — unattended Gmail drafts
2. **This UI** — on-demand strict tailor + later Kanban of applied roles

Do not fork curation prompts or Master CV ownership into this repo.

## Who it's for

**Primary:** The same operator as CCC — uses this UI when they want a CV + reply text now, without waiting for inbox scan.

**Secondary (next):** Same person tracking which roles they applied to (Kanban), then timeline/nudges once that board exists.

## Key metrics

Inherited from CCC until product analytics exist:

- **Submit bar** — would you send this CV?
- **Grounding** — no invented facts
- **Rewrite rate** — drafts sent without manual CV rewrite
- **Frontend-specific:** secret never in the browser; time-to-download after paste

## Tracks

### On-demand tailor UI (M1)

Paste JD → server Bearer call → `.docx` + `replyText`.

### Job tracker (M2+)

Kanban of applied roles first. Gantt and follow-up nudges stay parked until the board exists.

## Not working on

- Rebuilding Gmail / inbox scan in this repo
- Putting `TAILOR_API_KEY` in the client
- Pivot / `flexible` as the commercial UI path until CCC in-field `strict` is excellent
- LLM-as-judge gates in the UI
- Multi-user / BYOK / crawling JD URLs

## Companion authority

Product thesis and deny-list for curation quality live in companion CCC `STRATEGY.md`. This file owns **frontend build order and UI-scope deny-list** only. Milestone status lives in `docs/plans/README.md`.
