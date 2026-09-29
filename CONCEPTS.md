# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

Companion CCC `CONCEPTS.md` owns backend curator/inbox terms in depth. This file keeps the terms agents need while working in **ccc-frontend**.

## Product surfaces

### On-demand tailor UI
The sync front in this repo: operator pastes a job description, this app’s server presents Bearer to CCC, page offers `.docx` download and shows `replyText`. Distinct from the CCC inbox worker (Gmail drafts).

### Bearer presenter
A server-side caller that attaches `Authorization: Bearer <TAILOR_API_KEY>` to CCC. Seekers and browsers never hold the key. In this repo: `app/api/tailor` → `tailorOnDemand`.

### CCC API URL
Base URL for the companion tailor service (`CCC_API_URL`). Local default: CCC on port **3001** while this app uses **3000**.

## CV tailoring (consumer view)

### Curation mode
Request flag on tailor (`curationMode`). This UI’s on-demand path uses **`strict`** only for M1. **`flexible`** is CCC’s pivot path — not the commercial UI track until STRATEGY says otherwise.

### Tailor request
A CCC `POST /api/tailor-cv` call with JD text. Success returns base64 `.docx` (`cv`), curated JSON, and on strict path recruiter **reply text** (`replyText`).

### Reply text
Recruiter-facing email body on successful **strict** tailor. Shown in the UI for copy/edit; inbox worker (CCC) pastes it into a Gmail draft.

### Master CV
Canonical career record owned by CCC (env/path in that repo). This frontend never loads or edits it — CCC resolves it server-side.

## Agent workflow

### LFG lane
Label on a `docs/plans/README.md` row: **`lfg`** (agent-executable), **`operator`**, **`parked`**, **`awaiting-merge`**.

### Drain
Operator-started iteration over `lfg` rows until none remain. Procedure lives in `AGENTS.md`.

### Companion CCC
Backend/API/inbox repo at `~/coding/CCC` (or the GitHub remote). Source of truth for tailor contract, Master CV, and overall product STRATEGY.
