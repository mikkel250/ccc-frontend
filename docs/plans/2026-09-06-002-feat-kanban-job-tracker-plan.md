---
title: "Kanban Job Tracker - Plan"
date: 2026-09-06
type: feat
topic: kanban-job-tracker
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Kanban Job Tracker - Plan

## Goal Capsule

- **Objective:** Give each signed-in operator a Kanban of applied roles stored in Postgres, isolated by user account, in this frontend repo only.
- **Product authority:** This Product Contract. CCC `STRATEGY.md` “two fronts, one API.” Gmail scan stays in the CCC repo. M1 tailor UI stays the sync front.
- **Open blockers:** None. Auth library and column set are recorded as assumptions below, not product blockers.
- **Tail:** Do not implement Gantt, nudges, Gmail, or CCC API changes.

---

## Product Contract

### Summary

Add accounts and a job board to ccc-frontend.
The operator registers or signs in, then creates and moves application cards across a pipeline.
Job rows live in Postgres and belong to the signed-in user.
The existing tailor page and `POST /api/tailor` require the same session so `TAILOR_API_KEY` is not spendable anonymously.

### Key Decisions

- **Backend database plus user accounts.** `(session-settled: user-directed — chosen over localStorage, JSON file, in-memory, or SQLite without accounts: the operator asked for a backend DB including user accounts)` Governs R1, R2, R3, R8.
- **Gmail / inbox worker stays in CCC.** `(session-settled: user-directed — chosen over rebuilding scan in this repo)` Governs R10.
- **Browser never holds `TAILOR_API_KEY`.** `(session-settled: user-approved — chosen over calling CCC from the client)` Governs R7, R9.

### Actors

- A1. Operator — registers, signs in, manages their own job cards, uses on-demand tailor while signed in.
- A2. This app’s server — session, Postgres, Bearer presenter to CCC.
- A3. CCC tailor API — unchanged `POST /api/tailor-cv`.

### Requirements

- R1. An operator can register with email and password and sign in to a durable session stored in Postgres. After the first user exists, further public registration is off unless `ALLOW_REGISTRATION=true`.
- R2. Signed-in operators can create, list, update, move, and delete job cards. Each card has company, role title, optional URL, optional notes, applied date (defaults to now if omitted), and pipeline column.
- R3. A user never reads or mutates another user’s jobs. Isolation is enforced in data access, not only by hiding UI.
- R4. The board shows four columns: Applied, Interview, Offer, Rejected. Drag or an equivalent control moves a card between columns.
- R5. Unauthenticated requests to job mutations and job reads fail closed (401 or redirect to sign-in). They do not create rows.
- R6. Unauthenticated `POST /api/tailor` returns 401 and does not call CCC.
- R7. `TAILOR_API_KEY`, `CCC_API_URL`, `DATABASE_URL`, and auth secrets stay server-only. No `NEXT_PUBLIC_` prefix on those values.
- R8. Job records include timestamps (and applied date) so later Gantt/nudges can reuse the same rows without a schema rewrite.
- R9. Missing or invalid session is client-safe. Error bodies do not include secrets or password hashes.
- R10. No Gmail, inbox scan, or CCC repo changes. No Gantt UI. No automated nudges.

### Key Flows

- F1. Register and sign in
  - **Trigger:** Operator opens `/register` or `/login`.
  - **Steps:** Submit email and password. Server creates or authenticates a user. HttpOnly session cookie is set. Operator reaches the board and tailor.
  - **Covered by:** R1, R5, R7, R9.
- F2. Manage applications
  - **Trigger:** Signed-in operator adds or moves a card.
  - **Steps:** Server Action uses session user id. Postgres writes `jobs` with that `userId`. Board re-renders that user’s cards only.
  - **Covered by:** R2, R3, R4, R8.
- F3. Authenticated tailor
  - **Trigger:** Signed-in operator submits a JD on the existing form.
  - **Steps:** `POST /api/tailor` checks session, then existing `tailorOnDemand`. Browser still receives `{ cv, replyText }` only.
  - **Covered by:** R6, R7.

### Acceptance Examples

- AE1. Isolation
  - **Covers R3.**
  - **Given:** User A has a job id. User B is signed in.
  - **When:** B requests update or delete of A’s id.
  - **Then:** B gets 404 or equivalent empty-not-found. A’s row is unchanged.
- AE2. Anonymous tailor
  - **Covers R6.**
  - **Given:** No session cookie.
  - **When:** Client POSTs `/api/tailor`.
  - **Then:** 401. CCC `fetch` is not called.
- AE3. Board round-trip
  - **Covers R2, R4.**
  - **Given:** Signed-in user.
  - **When:** They create a card in Applied and move it to Interview.
  - **Then:** Reload still shows that card in Interview for that user only.

### Scope Boundaries

**Deferred**

- Gantt (M3) and nudges (M4).
- OAuth / social login.
- Email verification and password reset (record as follow-up if Better Auth plugins are easy; not required to ship M2).
- Postgres RLS as a second isolation line (app-layer `userId` filter is required; RLS is optional hardening).
- Saving tailor `cv` / `replyText` onto a job card.
- Per-user tailor rate limits beyond CCC’s existing buckets.

**Outside this product's identity**

- Re-implementing Gmail scan in this repo.
- Embedding `TAILOR_API_KEY` in the browser.
- Changing the CCC API repository.

<!-- ce-section: work-relationships -->
### How This Work Fits Together

This plan owns **Kanban job tracker** (README M2).

- M1 on-demand tailor — **already in this repo.** This plan adds session to that surface. It does not replace the proxy helper.
- CCC inbox worker — **Can proceed independently** in the CCC repo.
- M3 Gantt — **Depends on** M2 job rows and dates. Parked.
- M4 Automated nudges — **Depends on** M2 (and dates). Parked.

Product Contract preservation: new bootstrap contract (no upstream requirements-only file).

---

## Planning Contract

### Key Technical Decisions

- KTD1. **PostgreSQL via `DATABASE_URL` and Prisma 6** (`prisma` + `@prisma/client` 6.x, `prisma-client-js`). Pin Prisma 6. Do not adopt Prisma 7+ driver adapters in this change. Local Postgres may be Docker Compose; hosted Neon (or any Postgres) is the same URL. `(session-settled: user-directed — chosen over localStorage, JSON file, in-memory, or SQLite without accounts: operator asked for a backend DB including user accounts)`
- KTD2. **Better Auth email/password with `prismaAdapter`.** Official Auth.js guidance for new projects in 2026 is Better Auth, not Auth.js v5 beta. Clerk is deferred. Files: `lib/auth.ts`, `lib/auth-client.ts`, `app/api/auth/[...all]/route.ts` via `toNextJsHandler(auth)`. Env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` equal to the browser origin (local `http://localhost:3000`), `trustedOrigins` that origin, Secure cookies when the origin is https. `getSessionUserId` uses `auth.api.getSession({ headers: await headers() })`. Middleware uses `getSessionCookie` from `better-auth/cookies` only — do not import Prisma or `lib/auth.ts` into Edge middleware.
- KTD3. **`Job` belongs to Better Auth `User`.** Fields: `id`, `userId`, `company`, `title`, `url` (optional), `notes` (optional), `status` enum `applied | interview | offer | rejected`, `position` (int), `appliedAt` (`DateTime @default(now())`), `createdAt`, `updatedAt`. Index `(userId, status, position)`. Cascade delete with user. On create or column move, set `position` to `max(position)+1` in that user’s target column (or `0` if empty). Do not take `position` from the client.
- KTD4. **Data access layer, not middleware-only authz.** `lib/session.ts` and `lib/jobs.ts` always `where: { userId }`. Job Server Actions: if session is null, `redirect('/login')` and do not call the DAL. HTTP 401 is for `POST /api/tailor` only. Zod: `http`/`https` URLs only; max lengths on company, title, notes; no client `userId`.
- KTD5. **Kanban UI is a Server Component load plus a client board.** `app/board/page.tsx` loads jobs. Move control is a per-card column select or buttons (drag optional; no new DnD kit). Empty board copy, mutation errors, and pending/disabled controls during a move are required. Cards show company, title, column; url/notes/applied date on edit. Edit and delete (confirm) use U4 actions.
- KTD6. **Session wraps `POST /api/tailor` before `tailorOnDemand`.** Same route. Set CCC `x-forwarded-for` to a server-derived IP only (`127.0.0.1` local). Never copy the inbound `X-Forwarded-For` header. Still return `{ cv, replyText }` only.
- KTD7. **Unit tests stay `tsx --test tests/**/*.test.ts` with injected deps / mocked Prisma / mocked session.** No live LLM. Isolation tests use two user ids. Optional Docker Postgres is for migrate/dev, not `npm test`.

### Assumptions

- A Postgres instance is available via `DATABASE_URL` for `prisma migrate` and `npm run dev`. Document Docker Compose as the local default.
- Email verification is off for v1 so a local operator can register without SMTP.
- Public registration is first-user-only unless `ALLOW_REGISTRATION=true` (needed for a hosted deploy that still presents a shared `TAILOR_API_KEY`).
- Better Auth cookie sessions are HttpOnly; the client auth SDK does not receive `TAILOR_API_KEY`.
- `BETTER_AUTH_URL` matches the origin that serves the app.
- Four pipeline columns are enough for “visible pipeline of applications.” Wishlist / custom columns are out.
- One Next.js app remains the only process; no separate jobs service.

### High-Level Technical Design

```
Browser  --session cookie-->  Next.js App Router
  /login /register            Better Auth + Prisma User/Session
  /board                      Server Component -> lib/jobs.ts -> Postgres Job
  / (tailor)                  TailorForm -> POST /api/tailor (session) -> CCC
```

Middleware may redirect anonymous users away from `/board`. Every Server Action and `/api/tailor` still calls `getSessionUserId`.

### Sequencing

U1 schema + Prisma client + `lib/auth.ts` generate → U2 pages/session/middleware → U3 lock tailor + XFF → U4 jobs DAL + tests → U5 board UI → U6 README/env.

### Sources / Research

- Repo: `app/api/lib/ccc-tailor.ts`, `app/api/tailor/route.ts`, `tests/ccc-tailor.test.ts` (helper + route + node:test pattern).
- CCC (read-only): `docs/api/API.md` missing `x-forwarded-for` → 400; STRATEGY two fronts.
- Prisma + Better Auth: https://www.prisma.io/docs/guides/authentication/better-auth/nextjs
- Auth.js new-project rec: Better Auth (do not add `next-auth@beta` for this plan).
- Next.js 15: `middleware.ts` still applies (this app is 15.5, not 16 `proxy.ts`).

---

## Implementation Units

### U1. Postgres schema and Prisma client

- **Goal:** Migrated Better Auth tables plus `Job` on PostgreSQL.
- **Requirements:** R8.
- **Files:** `prisma/schema.prisma`, `lib/prisma.ts`, `lib/auth.ts`, `docker-compose.yml`, `.env.example`, `package.json`.
- **Approach:** Add `better-auth`, `prisma@6`, `@prisma/client@6`. `lib/auth.ts` exports `betterAuth` with `prismaAdapter` and `emailAndPassword` (sign-up disabled when a User exists unless `ALLOW_REGISTRATION=true` — implement the gate in U2 if the plugin flag is insufficient). Order: Prisma datasource + generator → `lib/auth.ts` → `npx @better-auth/cli generate` → add `Job` with `User.jobs` and `onDelete: Cascade` → migrate. Singleton PrismaClient on `globalThis`. Lazy import so module eval does not require a live DB. `package.json`: `postinstall` `prisma generate`; `build` `prisma generate && next build --turbopack`. Compose: Postgres 16, `127.0.0.1:5432:5432`, non-empty `POSTGRES_PASSWORD`, volume. `DATABASE_URL` points at that.
- **Done when:** `prisma migrate` applies against Compose Postgres; auth tables and `Job` exist.
- **Test scenarios:**
  - Schema includes `Job.userId` required, `appliedAt` with default now, and `status` enum with four values.
- **Dependencies:** none.
- **Verification:** `npx prisma validate`; migrate against Compose.

### U2. Better Auth email and password

- **Goal:** Register (when allowed), sign in, sign out, session cookie.
- **Requirements:** R1, R5, R7, R9.
- **Files:** `lib/auth.ts`, `lib/auth-client.ts`, `lib/session.ts`, `app/api/auth/[...all]/route.ts`, `app/login/page.tsx`, `app/register/page.tsx`, `middleware.ts`, `app/layout.tsx`.
- **Approach:** `toNextJsHandler(auth)` on the catch-all route. `getSessionUserId` uses `headers()`. Register form: email + password (min 8). Pass `name` as the email local-part to `signUp.email`. After login/register, go to `/board`. Signed-in nav: Tailor (`/`), Board (`/board`), Sign out. Signed-out nav: Login, Register. Auth errors `role=alert`. First-user lock: if a User already exists and `ALLOW_REGISTRATION` is not true, reject new sign-up with a client-safe error. Middleware cookie check for `/board` only as an optimistic gate.
- **Done when:** First register → cookie → `getSessionUserId` is non-null; sign out clears it; second public register fails when lock is on.
- **Test scenarios:**
  - `getSessionUserId` with mocked missing session → null.
  - Login page does not import `TAILOR_API_KEY`.
- **Dependencies:** U1.
- **Verification:** Manual register/login against Compose; unit test session helper.

### U3. Session on tailor proxy

- **Goal:** Anonymous tailor cannot spend the key. Live CCC receives an IP header.
- **Requirements:** R6, R7.
- **Files:** `app/api/tailor/route.ts`, `app/api/lib/ccc-tailor.ts`, `app/page.tsx`, `tests/ccc-tailor.test.ts`.
- **Approach:** Route calls `getSessionUserId`; if null, 401 and return before `tailorOnDemand`. Helper always sets `x-forwarded-for` to `127.0.0.1` (or a configured trusted IP). Test that a spoofed inbound header is not forwarded. Redirect unsigned visitors from `/` to `/login`. Keep `{ cv, replyText }` envelope.
- **Done when:** AE2 passes in unit tests (fetchImpl not called).
- **Test scenarios:**
  - No session → 401, `fetchImpl` not called.
  - Session present → existing 200/401/empty-JD cases still hold.
  - CCC fetch `x-forwarded-for` is the trusted IP, not a spoofed inbound value.
  - Add the 422 mapping test required by `docs/plans/2026-09-06-001-feat-ondemand-tailor-ui-plan.md` U2 if still missing.
- **Dependencies:** U2.
- **Verification:** `npm test`.

### U4. Jobs data access and isolation tests

- **Goal:** CRUD and column moves scoped to session user.
- **Requirements:** R2, R3, R5, R8, R9.
- **Files:** `lib/jobs.ts`, `app/actions/jobs.ts`, `tests/jobs-isolation.test.ts`, `package.json`.
- **Approach:** Functions: list, create, update (including `status`/`position`), delete. Every query includes `userId` from session. Update/delete with wrong user → not found. Zod for input (`http`/`https` url, max lengths). Server Actions wrap the DAL, `redirect('/login')` if no session, and `revalidatePath('/board')`. Add `zod` if not present. When applied date is omitted, persist DB default now. Compute `position` per KTD3.
- **Done when:** AE1 is a unit test with two mocked users.
- **Test scenarios:**
  - list(userA) does not include userB jobs.
  - update(userB, jobA.id) does not change the row.
  - create without user id is impossible at the type/call boundary (session required).
  - Invalid status rejected.
- **Dependencies:** U1, U2.
- **Verification:** `npm test`.

### U5. Kanban board UI

- **Goal:** Visible pipeline of the signed-in user’s applications.
- **Requirements:** R2, R4, R5.
- **Files:** `app/board/page.tsx`, `app/board/kanban-board.tsx`, `app/layout.tsx`.
- **Approach:** Server page: session or redirect to `/login`. Load `listJobs(userId)`. Client board: four columns; add form; per-card column select/buttons to move; edit company/title/url/notes/applied date; delete with confirm. Empty-board message. Error copy on failed list/mutation. Disable controls while a mutation is pending. Tailwind only; no new kit.
- **Done when:** AE3 can be exercised locally, including edit and delete.
- **Test scenarios:**
  - Unsigned `/board` redirects to login.
  - Add/move/edit/delete covered by DAL tests; optional DOM test not required.
- **Dependencies:** U4.
- **Verification:** Manual against Compose; `npm run build`.

### U6. Operator docs

- **Goal:** Cold start of UI + Postgres + CCC after this auth cutover.
- **Requirements:** R7, R10.
- **Files:** `README.md`, `docs/plans/README.md`, `.env.example`.
- **Approach:** Document Compose (loopback Postgres), migrate, first-user register, `ALLOW_REGISTRATION`, `BETTER_AUTH_*` matching origin, existing CCC env. State that `/` and `POST /api/tailor` require a session (M1 anonymous tailor is gone). Mark M2 in progress; M3/M4 parked. Do not document putting the tailor key in the browser.
- **Done when:** README lists auth + DB + tailor ports and the session requirement.
- **Test scenarios:** none (docs).
- **Dependencies:** U1–U5.
- **Verification:** Read-through.

---

## Verification Contract

- `npm test` — `tsx --test tests/**/*.test.ts` (isolation, tailor 401, XFF, existing proxy cases).
- `npm run build` — `prisma generate && next build --turbopack` with lazy Prisma.
- `npx prisma migrate` against Compose (or provided `DATABASE_URL`) for local proof.
- Do not call live CCC in `npm test`.
- Manual: register, AE3 on `/board`, one signed-in tailor against CCC on 3001.

## Definition of Done

- All units complete. Abandoned experiment code removed from the diff.
- `npm test` and `npm run build` pass.
- AE1–AE3 hold.
- No `TAILOR_API_KEY` in client bundles.
- `docs/plans/README.md` names M2 as this plan; M3/M4 remain parked.
- CCC repository untouched.
