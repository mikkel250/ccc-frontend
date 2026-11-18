---
title: "Production health route and env runbook - Plan"
date: 2026-11-16
type: feat
topic: production-health-runbook
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Production health route and env runbook - Plan

## Goal Capsule

- **Objective:** An operator can confirm this process is alive without a session, and can set every production env var without guessing host-specific config.
- **Means:** Unauthenticated `GET /api/health` plus a host-agnostic env runbook that catalogs every var, defaults, and fail-closed behavior (KTD1, KTD4).
- **Product authority:** Nightly production-readiness loop. User-directed pick of this slice over overlapping with open PRs #35 and #36.
- **Open blockers:** Host platform remains TBD. This plan does not pick a host.
- **Tail:** Do not add APM, host config, nonce CSP, Next 16, Prisma 7, or files owned by #35/#36.

---

## Product Contract

### Summary

Build/deploy is the weakest remaining closable checklist area: there is no liveness URL and no production env runbook. Auth middleware already leaves `/api/*` public except session-gated tailor. `instrumentation.ts` already requires `RATE_LIMIT_ALLOW_PROCESS_LOCAL` in production. Missing `CCC_API_URL` / `TAILOR_API_KEY` already fail closed per tailor request. This slice adds a secret-safe health JSON route and documents that contract so a host can be wired later without rediscovering vars.

### Problem Frame

Local README covers Compose + `npm run dev`. Production has no catalog of required secrets, origin matching, rate-limit startup, or what breaks when a var is missing. A load balancer has nothing unauthenticated to probe.

### Key Decisions

- KD1. Ship the health route plus production env runbook, not a11y or extra rate-limit tests. `(session-settled: user-directed — chosen over overlapping #35/#36: those PRs already cover skip-link/focus and rate-limit/auth UI tests)` Governs R1–R6.
- KD2. Do not change product behavior beyond liveness and documentation. `(session-settled: user-directed — nightly loop; one focused PR)` Governs R6.
- KD3. Do not edit files in open PRs #35 and #36. `(session-settled: user-directed — PR independence)` Governs R6.
- KD4. Health is liveness only: no DB, CCC, or secret presence checks. `(session-settled: user-directed — request named a lightweight unauthenticated liveness route)` Governs R1, R2.

### Actors

- A1. Operator / host — sets env from the runbook, points a probe at `GET /api/health`.
- A2. Unauthenticated probe — receives 200 JSON with no secrets.
- A3. Signed-in operator — tailor, board, and auth flows unchanged.

### Requirements

- R1. `GET /api/health` returns HTTP 200 with JSON `{ "ok": true }` and `Cache-Control: no-store`. No other fields.
- R2. The response body and headers never include env values, secret names with values, `DATABASE_URL`, `TAILOR_API_KEY`, `BETTER_AUTH_SECRET`, hostnames, versions, or dependency status.
- R3. Auth middleware does not gate `/api/health`. Unsigned callers are not redirected to `/login`.
- R4. A host-agnostic runbook lists every env var this app reads (required and optional), defaults, and what breaks when each is missing or invalid. No Vercel/Fly/Railway-specific files.
- R5. Tests lock R1–R3 and that the runbook names every catalogued var. Existing suites stay green without editing #35/#36 files.
- R6. No change to tailor, jobs, auth, rate-limit consumption, CSP, or UI. Do not expand `instrumentation.ts` with new required vars (that would change `register()` and collide with `tests/rate-limit.test.ts` in #36).

### Key Flows

- F1. Liveness probe
  - **Trigger:** Host or operator `GET /api/health` with no cookies.
  - **Steps:** Middleware does not match. Handler returns 200 `{ "ok": true }` and `Cache-Control: no-store`.
  - **Covered by:** R1, R2, R3.
- F2. Production env setup
  - **Trigger:** Operator prepares a host.
  - **Steps:** Copy the runbook catalog. Set required vars. Optional vars keep documented defaults. Missing CCC vars leave the process up; tailor returns the existing client-safe 503.
  - **Covered by:** R4, R6.

### Acceptance Examples

- AE1. Unsigned GET health
  - **Covers R1, R3.**
  - **Given:** The health GET handler.
  - **When:** Called with a Request to `/api/health` and no cookies.
  - **Then:** Status 200, JSON `{ "ok": true }`, `Cache-Control` includes `no-store`.
- AE2. No secret leakage
  - **Covers R2.**
  - **Given:** Env contains distinctive `TAILOR_API_KEY`, `BETTER_AUTH_SECRET`, and `DATABASE_URL` values.
  - **When:** Health GET runs.
  - **Then:** Status, headers, and serialized body contain none of those strings.
- AE3. Middleware stays page-only
  - **Covers R3.**
  - **Given:** `middleware.ts` `config.matcher`.
  - **When:** Inspected.
  - **Then:** It remains `["/", "/board", "/board/:path*"]` (no `/api` matcher).
- AE4. Runbook catalogs env
  - **Covers R4.**
  - **Given:** `docs/ops/production-env.md` and `.env.example`.
  - **When:** A source test lists every env key from `.env.example` plus `NODE_ENV` as used by production checks.
  - **Then:** The runbook names each key and states required vs optional, default, and missing/invalid effect.
- AE5. Product behavior unchanged
  - **Covers R6.**
  - **Given:** Existing tailor, session, middleware, and rate-limit tests.
  - **When:** `npm test` runs without editing #35/#36 files.
  - **Then:** They pass.

### Scope Boundaries

- In: `app/api/health/route.ts`, `tests/health.test.ts`, optional assertion in `tests/middleware.test.ts`, `docs/ops/production-env.md`, index in `docs/README.md`, a short pointer in `README.md`.
- Out: Host platform files, APM, readiness/DB probes, nonce CSP, Next 16, Prisma 7, UI, tailor/auth/rate-limit logic.
- Deferred to Follow-Up Work: Host choice and deploy config; APM; nonce-based CSP; expanding production startup checks beyond the existing `RATE_LIMIT_ALLOW_PROCESS_LOCAL` gate (blocked here by #36 owning `tests/rate-limit.test.ts`).

---

## Planning Contract

### Key Technical Decisions

- KTD1. Add `GET` only on `app/api/health/route.ts` using `NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })`. Do not export other methods. Next.js returns 405 for them.
- KTD2. Leave `middleware.ts` matcher unchanged. `/api/health` is already outside `["/", "/board", "/board/:path*"]`. Tests lock that array rather than rewriting matcher syntax.
- KTD3. Do not call new validators from `instrumentation.ts`. `register()` already requires `RATE_LIMIT_ALLOW_PROCESS_LOCAL` in production and skips during `NEXT_PHASE=phase-production-build`. Expanding it would change the last `await register()` in `tests/rate-limit.test.ts` (#36). Document existing fail-closed paths in the runbook instead.
- KTD4. Put the runbook at `docs/ops/production-env.md`. Index it from `docs/README.md` and add one README pointer. Do not edit `docs/arch/README.md`, `docs/plans/README.md`, or `docs/test/README.md` (#35).
- KTD5. New tests live in `tests/health.test.ts`. `tests/middleware.test.ts` may add an AE3 assertion. Do not edit `tests/rate-limit.test.ts`, `tests/pre-auth-rate-limit.test.ts`, `tests/operator-ui.test.ts`, `tests/jobs-actions.test.ts`, or any #35 UI files.
- KTD6. Test-first for the route. Confirm red on missing handler, then implement.

### Assumptions

- Liveness JSON is exactly `{ "ok": true }`. Extra fields would be an information leak or a contract to maintain.
- `CCC_TRUSTED_PROXY` appears only in `tests/tailor-route.test.ts` snapshots and is not a production env var; the runbook omits it.
- `BETTER_AUTH_URL` must equal the browser origin in production (`lib/auth-config.ts` already throws if unset when `NODE_ENV` is production at auth module load).
- Missing `CCC_API_URL` / `TAILOR_API_KEY` keep the process up; tailor returns the existing client-safe 503. Health stays 200. That is intentional so a probe does not couple to CCC.
- Host remains operator-chosen; the runbook is host-agnostic.

### Sequencing

U1 red health/middleware tests → U2 health route → U3 runbook + indexes → U4 lint/typecheck/test/build and curl against a local server if it starts.

### Research

- Middleware matcher is page-only (`middleware.ts`).
- Production startup gate is only `resolveAllowProcessLocalRateLimit()` in `instrumentation.ts`.
- CCC missing env is per-request in `app/api/lib/ccc-tailor.ts`.
- `.env.example` is the env catalog; `CCC_FETCH_TIMEOUT_MS` is the only commented optional there besides rate-limit comments.
- Open PR #35 owns layout/a11y files and `docs/plans/README.md` / `docs/arch/README.md` / `docs/test/README.md`.
- Open PR #36 owns `tests/rate-limit.test.ts` and related regression tests.

---

## Implementation Units

### U1. Health contract tests (red)

- **Goal:** Tests that fail on current main for R1–R3.
- **Files:** `tests/health.test.ts`; optionally `tests/middleware.test.ts`.
- **Approach:** Import GET from the health route (will fail to resolve). Assert AE1–AE3. Snapshot distinctive secrets into `process.env` and assert they do not appear in the Response. Execution note: test-first; confirm red before U2.
- **Done when:** `npm test -- tests/health.test.ts` fails because `app/api/health/route.ts` does not exist.
- **Test scenarios:** AE1, AE2, AE3.

### U2. Health GET handler (green)

- **Goal:** R1–R3 pass.
- **Files:** `app/api/health/route.ts`.
- **Approach:** Export `GET`. Return `NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })`. No env reads, no Prisma, no session, no logs of request headers.
- **Done when:** AE1–AE3 pass. Existing middleware tests still pass.
- **Test scenarios:** AE1, AE2, AE3, AE5.

### U3. Production env runbook

- **Goal:** R4.
- **Files:** `docs/ops/production-env.md`, `docs/README.md`, `README.md`.
- **Approach:** Create `docs/ops/` if needed. Table of every var this process reads: `CCC_API_URL`, `TAILOR_API_KEY`, `CCC_FETCH_TIMEOUT_MS`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ALLOW_REGISTRATION`, `RATE_LIMIT_ALLOW_PROCESS_LOCAL`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `JOB_RATE_LIMIT_MAX`, plus `NODE_ENV` as the production switch. For each: required vs optional, default, what breaks if missing/invalid. Note: never `NEXT_PUBLIC_` on secrets; `BETTER_AUTH_URL` must match browser origin; health does not prove CCC or Postgres. Put the AE4 catalog assertion in `tests/health.test.ts` so #35/#36 test files stay untouched.
- **Done when:** AE4 passes. Docs index lists the runbook.
- **Test scenarios:** AE4.

### U4. Gates and local probe

- **Goal:** Verification Contract.
- **Files:** none new.
- **Approach:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. If `npm run start` or `npm run dev` can bind locally, curl `GET /api/health` and `POST /api/health`. Substitute tests if the server cannot start.
- **Done when:** All four npm commands are green. Curl or documented substitute recorded.
- **Test expectation:** none — command gates. Feature coverage lives in U1–U3.

---

## Verification Contract

- `npm test` — includes `tests/health.test.ts` and the existing suite (mocked CCC; no live LLM).
- `npm run lint`
- `npm run typecheck`
- `npm run build` — `prisma generate` then production build.
- Curl `GET /api/health` against a local Next server when it starts; otherwise tests plus the middleware matcher assertion are the substitute.

---

## Definition of Done

- U1–U4 complete.
- Unsigned `GET /api/health` returns `{ "ok": true }` with `Cache-Control: no-store`.
- Runbook catalogs every env var this app reads.
- Lint, typecheck, tests, and build pass.
- Diff does not include files from #35 or #36.
- No host config, APM, or new `register()` required vars.
