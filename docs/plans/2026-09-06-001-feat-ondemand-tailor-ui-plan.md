---
title: "On-demand Tailor UI - Plan"
date: 2026-09-06
type: feat
topic: ondemand-tailor-ui
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# On-demand Tailor UI - Plan

## Goal Capsule

- **Objective:** Give the operator a local web page to paste a job description, get a tailored CV `.docx` and strict `replyText` from CCC, without holding the API key in the browser.
- **Product authority:** This Product Contract. CCC `STRATEGY.md` “two fronts, one API.” Gmail scan stays in the CCC repo.
- **Open blockers:** None. Job tracking (Kanban) is the next frontend `/lfg`, not this plan.

---

## Product Contract

### Summary

Scaffold this empty repo as a Next.js App Router app.
The only v1 page is an on-demand tailor form: paste JD, submit, wait, download Word, read the recruiter reply.
A server route presents `TAILOR_API_KEY` to CCC `POST /api/tailor-cv` with `curationMode: "strict"`.

### Key Decisions

- **On-demand UI first; Kanban next.** `(session-settled: user-directed — chosen over job-tracking-first or a combined LFG: one shippable front per /lfg)` Governs R1, R10.
- **Browser never holds `TAILOR_API_KEY`.** `(session-settled: user-approved — chosen over calling CCC from the client: CCC presenters are server-side only)` Governs R3, R4.
- **Gmail / inbox worker stays in CCC.** `(session-settled: user-directed — chosen over rebuilding scan in this repo)` Governs R10.

### Actors

- A1. Operator — pastes a JD, downloads CV, copies or edits reply text.
- A2. This app’s server route — Bearer presenter to CCC.
- A3. CCC tailor API — `POST /api/tailor-cv`.

### Requirements

- R1. A single page lets the operator paste a job description and submit.
- R2. Submit sends `jobDescription` with `curationMode: "strict"` via this app’s server, not from the browser to CCC.
- R3. `TAILOR_API_KEY` and `CCC_API_URL` are server env only (`.env.local` / deploy vars). They are never sent to the client bundle.
- R4. Missing server env fails closed with a client-safe error (no key in the message).
- R5. On CCC 200, the operator can download a valid `.docx` from `cv` (base64).
- R6. On CCC 200, the page shows `replyText` when present so the operator can copy it.
- R7. CCC 4xx/5xx and network failures surface the API `error` string (or a generic fallback) without crashing the page.
- R8. Empty JD does not call CCC.
- R9. Local proof is `npm run dev`. Same app is deployable later via env (no rewrite).
- R10. No Gmail, no Kanban, no persistence of tailor history in this change.

### Key Flows

- F1. On-demand tailor
  - **Trigger:** Operator pastes JD and submits.
  - **Steps:** Client POSTs to this app’s `/api/tailor`. Server reads env, POSTs CCC with Bearer + JSON. Server returns `cv` + `replyText` (and safe error). Client offers download and shows reply.
  - **Covered by:** R1–R9.

### Acceptance Examples

- AE1. Happy path
  - **Covers R5, R6.**
  - **Given:** CCC reachable with valid key.
  - **When:** Operator submits a non-empty JD.
  - **Then:** A `.docx` download is offered and `replyText` is visible if CCC returned it.

- AE2. Empty JD
  - **Covers R8.**
  - **Given:** Empty textarea.
  - **When:** Operator submits.
  - **Then:** No CCC request; validation message on the page.

- AE3. Key not in client
  - **Covers R3.**
  - **Given:** Built client JS.
  - **When:** Inspected for secrets.
  - **Then:** `TAILOR_API_KEY` is not present.

<!-- ce-section: work-relationships -->
### How This Work Fits Together

This plan owns **on-demand sync tailor UI** (README M1).

- CCC inbox worker (Gmail drafts) — **Can proceed independently** in the CCC repo.
- M2 Kanban job tracker — **Depends on** this app existing. **Next `/lfg`.** Same jobs the operator applied to; not in this plan’s units.
- M3 Gantt — **Depends on** M2 records. Parked.
- M4 Automated nudges / follow-ups — **Depends on** M2 (and dates). Parked.

### Scope Boundaries

**Deferred**

- Kanban / application board (M2).
- Gantt (M3).
- Follow-up nudges (M4).
- Saving tailor history, login, multi-user.
- Flexible mode toggle.

**Outside this product's identity**

- Re-implementing Gmail scan in this repo.
- Embedding `TAILOR_API_KEY` in the browser.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Next.js 15 App Router + TypeScript + npm**, app dir at repo root (same major family as CCC). Tailwind for layout. No extra UI kit.
- KTD2. **`app/api/tailor/route.ts`** is the only CCC client. `POST` JSON `{ jobDescription }`. Server adds `curationMode: "strict"` and `Authorization: Bearer`.
- KTD3. Env: `CCC_API_URL` (e.g. `http://localhost:3001` if CCC is 3000 — this app uses **3000** by default; document running CCC on **3001** or set URL). `TAILOR_API_KEY`. Fail 503 if either unset.
- KTD4. Proxy does not forward `curatedJson` to the browser unless needed for download naming; v1 returns `{ cv, replyText }` (and `error`). Smaller client surface.
- KTD5. **node:test** unit tests for the proxy helper (mock `fetch`). No live LLM in `npm test`.
- KTD6. Filename for download: `tailored-cv.docx` (no JD-derived names in v1).

### Assumptions

- CCC `POST /api/tailor-cv` matches `docs/api/API.md` on the CCC repo (`cv` base64, strict `replyText`).
- Operator runs CCC separately; this app does not start it.
- No git remote yet: LFG ships local commits; push/PR skipped until origin exists.

### Sequencing

U1 scaffold → U2 proxy + tests → U3 page → U4 README/env docs.

---

## Implementation Units

### U1. Next.js scaffold and env contract

- **Goal:** Runnable `npm run dev` app with `.env.example`.
- **Files:** `package.json`, `app/layout.tsx`, `app/page.tsx` (placeholder ok), `tsconfig.json`, `next.config.ts`, `.env.example`, `.gitignore`.
- **Approach:** `create-next-app` Next 15, TypeScript, Tailwind, App Router, no src dir. Default port 3000.
- **Done when:** `npm run build` succeeds on the scaffold; `.env.example` lists `CCC_API_URL` and `TAILOR_API_KEY`.
- **Test scenarios:**
  - Build completes without CCC running.

### U2. Server-side tailor proxy

- **Goal:** Bearer CCC call from the server only.
- **Files:** `app/api/lib/ccc-tailor.ts`, `app/api/tailor/route.ts`, `tests/ccc-tailor.test.ts`.
- **Approach:** Helper `tailorOnDemand(jobDescription: string)` reads env, POSTs CCC, maps 200 to `{ cv, replyText }`, maps errors to `{ error, status }`. Route validates non-empty string, max 50000 chars (CCC JD cap). Never log the API key.
- **Done when:** Unit tests cover 200, 401, 422, missing env, empty JD rejected before fetch.
- **Test scenarios:**
  - Empty/whitespace JD → 400, `fetch` not called.
  - Unset env → 503, client-safe message.
  - Mock 200 with `cv` + `replyText` → 200 JSON those fields only.
  - Mock 401 → 401 with `error` from body or generic.
  - `TAILOR_API_KEY` not in 200 JSON.

### U3. Operator tailor page

- **Goal:** Form + results.
- **Files:** `app/page.tsx`, small client component if needed (`app/tailor-form.tsx`).
- **Approach:** Textarea, submit, pending state, error banner, `<pre>` or readable block for `replyText`, download button using `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,`.
- **Done when:** AE1–AE2 can be exercised locally against a stub or live CCC.
- **Test scenarios:**
  - Client component: empty submit does not POST (optional DOM test; proxy already covers R8).

### U4. Operator docs

- **Goal:** README how to run with CCC.
- **Files:** `README.md`, `docs/plans/README.md` (already lists M2).
- **Approach:** Port 3000 frontend, CCC on 3001 example, copy `.env.example`.
- **Done when:** A cold operator can start both apps from README.
- **Test scenarios:** none (docs).

---

## Verification Contract

- `npm test` — `node --test tests/**/*.test.ts` (tsx or Node test with TypeScript via compiled tests; prefer `tsx --test tests/*.test.ts` if needed).
- `npm run build` — production build.
- Do not call live CCC in CI.
- Manual: `npm run dev` + CCC, one real JD (operator).

---

## Definition of Done

- All units above complete.
- `npm test` and `npm run build` pass.
- No `TAILOR_API_KEY` in client bundles (`next build` + grep `.next/static` must not contain the key from a fixture env).
- M2 Kanban named as next `/lfg` on `docs/plans/README.md`.
- Gmail not imported.

## Confidence

- **Implementation:** High for proxy + form; CCC contract is documented.
- **Integration:** Medium until operator points `CCC_API_URL` at a running API (PR #47 `replyText` may still be merging).
- **Product:** High for this slice; Kanban explicitly out.
