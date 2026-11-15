---
title: "Operator UI accessibility pass - Plan"
date: 2026-11-15
type: feat
topic: operator-ui-accessibility
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Operator UI accessibility pass - Plan

## Goal Capsule

- **Objective:** Keyboard and screen-reader operators can skip the site header, land in the page landmark, see where focus is, and use every form control with an accessible name.
- **Means:** One skip-to-content link in the root layout, `id="main-content"` on existing `<main>` elements, `:focus-visible` styles in `app/globals.css`, and labels on the unlabeled Kanban edit fields. Tests lock the contract. No product-flow change.
- **Product authority:** Nightly production-readiness loop. User-directed pick of the accessibility pass over a host-agnostic production env runbook plus `/api/health`.
- **Open blockers:** None for this slice. Host/deploy, APM, Prisma 7, and Next 16 stay needs-user.
- **Tail:** Do not add `/api/health`, a production env runbook, security-header changes, APM, or major upgrades.

---

## Product Contract

### Summary

Keyboard users currently tab through the header nav on every page because there is no skip link. Pages already wrap content in `<main>`, but those landmarks have no skip target id. `app/globals.css` has no `:focus-visible` rule. Login, register, tailor, and Kanban create forms already wrap controls in `<label>`. The Kanban **edit** form fields have no accessible names. This pass closes those gaps without changing tailor, auth, or board behavior.

### Key Decisions

- KD1. Ship the accessibility pass, not the health-route plus production runbook. `(session-settled: user-directed — pick the highest-value closable checklist area without host credentials)` Governs R1–R5.
- KD2. Do not change product behavior beyond what accessibility requires. `(session-settled: user-directed — nightly loop; one focused PR)` Governs R6.
- KD3. Do not upgrade Next/Prisma majors. `(session-settled: user-directed — those remain owner decisions)` Governs R6.

### Actors

- A1. Keyboard operator — tabs from the skip link into page content, sees focus, submits labeled forms.
- A2. Screen-reader operator — hears a skip link, a main landmark named by the existing `h1`, and named form controls.
- A3. Pointer operator — no change to mouse/click flows.

### Requirements

- R1. Root layout exposes a skip-to-content link as the first focusable element in `<body>`, before `SiteHeader`. The link targets `#main-content` with a same-page native `<a>` (not `next/link`).
- R2. Every page `<main>` (home, login, register, board success, board load-error, `app/error.tsx`) has `id="main-content"` and is programmatically focusable (`tabIndex={-1}`) so the skip link moves keyboard focus. `app/global-error.tsx` keeps its own `<main>` landmark; it replaces the root layout so it does not host the skip link.
- R3. `:focus-visible` styles in `app/globals.css` draw a 2px `--foreground` outline with 2px offset plus a `--background` box-shadow ring so the mark stays visible on filled primary buttons and on both light and dark page backgrounds. The skip link is visually hidden until focused, then appears above the header.
- R4. Every operator-editable form control has an accessible name. Keep existing wrapping `<label>` elements. Add wrapping labels on the Kanban edit form fields (company, title, URL, applied date, notes) matching the create-form wording.
- R5. Tests prove R1–R4: skip link source and render, `#main-content` on page mains, focus-visible and skip-link CSS, Kanban edit labels. Existing operator-ui tests still pass.
- R6. No API, auth, rate-limit, env-var, or copy changes except the skip-link text and the new edit-field labels.

### Key Flows

- F1. Skip to content
  - **Trigger:** Operator tabs once on any layout-backed page.
  - **Steps:** Focus lands on "Skip to content". Activating it moves focus to `#main-content`. Next tab continues inside the page, not the header.
  - **Covered by:** R1, R2, R3.
- F2. Labeled board edit
  - **Trigger:** Operator opens Edit on a card.
  - **Steps:** Company, Role title, URL, Applied date, and Notes are named the same way as the create form.
  - **Covered by:** R4.
- F3. Existing labeled submits
  - **Trigger:** Sign in, register, tailor, add card.
  - **Steps:** Unchanged wrapping labels and submit behavior.
  - **Covered by:** R4, R6.

### Acceptance Examples

- AE1. Skip link is first
  - **Covers R1.**
  - **Given:** Rendered `SkipToContent` (or root layout source).
  - **When:** The first `<a>` is inspected.
  - **Then:** Text is "Skip to content", `href` is `#main-content`.
- AE2. Page mains are skip targets
  - **Covers R2.**
  - **Given:** `app/page.tsx`, `app/login/page.tsx`, `app/register/page.tsx`, `app/board/page.tsx`, `app/error.tsx`.
  - **When:** Source is read.
  - **Then:** Each `<main>` includes `id="main-content"` and `tabIndex={-1}`.
- AE3. Focus and skip CSS
  - **Covers R3.**
  - **Given:** `app/globals.css`.
  - **When:** Source is read.
  - **Then:** `:focus-visible` sets a 2px `--foreground` outline, 2px offset, and `--background` box-shadow (not `currentColor`); `.skip-link` is off-screen until `:focus` / `:focus-visible`.
- AE4. Edit fields are labeled
  - **Covers R4.**
  - **Given:** A board with one card, Edit clicked.
  - **When:** The edit form is inspected.
  - **Then:** Each of company, title, url, appliedAt, notes is inside a `<label>` whose text matches the create form (Company, Role title, URL, Applied date, Notes).
- AE5. Product behavior unchanged
  - **Covers R6.**
  - **Given:** Existing operator-ui, session, and tailor tests.
  - **When:** `npm test` runs.
  - **Then:** They pass without auth/API/env changes.

### Scope Boundaries

- In: `app/layout.tsx`, a small skip-link component, `app/globals.css`, page `<main>` attributes, Kanban edit labels, tests, this plan, a one-line index in `docs/plans/README.md`, and a short note in `docs/arch/README.md` / `docs/test/README.md`.
- Out: `/api/health`, production env runbook, APM, security headers, color-contrast audit of existing text, full WCAG AAA, drag-and-drop board a11y, `global-error.tsx` skip link (no header to skip), Next 16, Prisma 7.
- Deferred to Follow-Up Work: host-agnostic production env runbook + `/api/health`; APM; contrast/theme tokens.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Extract `SkipToContent` in `app/skip-to-content.tsx` so tests can render it without loading Google fonts from `app/layout.tsx`. Layout places it as the first child of `<body>`.
- KTD2. Keep per-page `<main>` elements; add `id` and `tabIndex` in place. Do not wrap `{children}` in another `<main>` (nested landmarks) and do not add a `PageMain` helper (existing pattern is page-local mains).
- KTD3. Put skip-link visibility and `:focus-visible` in `app/globals.css`. Do not rely on Tailwind `sr-only` so source tests can lock the CSS without compiling Tailwind.
- KTD4. Native `<a href="#main-content">` only. `next/link` would client-navigate instead of jumping in-page.
- KTD5. Label the Kanban edit fields with wrapping `<label>` matching the create form. Do not add `htmlFor`/`id` churn on already-wrapped login, register, tailor, or create controls.
- KTD6. Tests: source-read for layout, CSS, and page mains (same pattern as `tests/error-boundary.test.ts`); happy-dom for skip-link render and Kanban edit labels (extend `tests/operator-ui.test.ts` or add `tests/accessibility.test.ts`). TDD: red tests first.

### Assumptions

- Browser default outlines are not reliable enough on this UI; an explicit `:focus-visible` rule is required even if Tailwind preflight does not remove outlines.
- Wrapping `<label>` already gives login/register/tailor/create an accessible name (implicit label). No markup change there except CSS focus.
- `app/global-error.tsx` replacing the root layout is acceptable without a skip link; there is no header to skip.
- Duplicate `id="main-content"` will not appear in one document because App Router renders one page tree plus one error UI, not two pages at once.

### Sequencing

U1 failing accessibility tests → U2 skip link + main ids + CSS → U3 Kanban edit labels → U4 docs + lint/typecheck/test/build.

---

## Implementation Units

### U1. Accessibility contract tests (red)

- **Goal:** Tests that fail on current main for R1–R4.
- **Files:** `tests/accessibility.test.ts`; extend `tests/operator-ui.test.ts` for AE4 if that file already owns Kanban render helpers.
- **Approach:** Source-read `app/layout.tsx` for `SkipToContent` before `SiteHeader`. Source-read page mains for `id="main-content"` and `tabIndex={-1}`. Source-read `app/globals.css` for `:focus-visible` and `.skip-link`. Render skip link; assert first link text and href. Open Kanban Edit and assert labeled fields.
- **Execution note:** Test-first. Confirm red before U2/U3.
- **Done when:** `npm test -- tests/accessibility.test.ts` (and the new operator-ui case) fail for the right reason: missing skip link, missing ids, missing CSS, unlabeled edit fields.
- **Test scenarios:** AE1, AE2, AE3, AE4.

### U2. Skip link, landmarks, focus styles (green)

- **Goal:** R1–R3 pass.
- **Files:** `app/skip-to-content.tsx`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/login/page.tsx`, `app/register/page.tsx`, `app/board/page.tsx`, `app/error.tsx`.
- **Approach:** Add `SkipToContent`. Point every layout-backed `<main>` at `#main-content` with `tabIndex={-1}`. CSS: `.skip-link` clipped/off-screen until focus; `:focus-visible { outline: 2px solid var(--foreground); outline-offset: 2px; box-shadow: 0 0 0 4px var(--background); }`.
- **Done when:** AE1–AE3 pass. Existing tests still pass.
- **Test scenarios:** AE1, AE2, AE3, AE5.

### U3. Kanban edit labels (green)

- **Goal:** R4 on the edit form.
- **Files:** `app/board/kanban-board.tsx`, `tests/operator-ui.test.ts` (or the U1 test file).
- **Approach:** Wrap the five edit inputs in `<label>` with the same visible names as the create form. Do not change names, validation, or actions.
- **Done when:** AE4 passes. Existing board tests still pass.
- **Test scenarios:** AE4, AE5.

### U4. Docs and gates

- **Goal:** Index the plan; note the skip-link/focus contract; run gates.
- **Files:** `docs/plans/README.md`, `docs/arch/README.md`, `docs/test/README.md`.
- **Approach:** Other-plans link. One-line arch note that layout ships a skip link targeting `#main-content`. Test README mentions accessibility source + happy-dom tests. Then `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- **Done when:** Docs point at this plan; all four commands are green.
- **Test expectation:** none — docs and command gates. Feature coverage lives in U1–U3.

---

## Verification Contract

- `npm test` — includes new accessibility tests and the existing suite (mocked CCC; no live LLM).
- `npm run lint`
- `npm run typecheck`
- `npm run build` — `prisma generate` then production build.
- Do not call live CCC. Browser verification if a local UI server can start; otherwise tests plus source reads are the substitute.

---

## Definition of Done

- U1–U4 complete.
- Keyboard tab order starts at "Skip to content" on layout-backed pages.
- Layout-backed `<main>` elements are `#main-content`.
- `:focus-visible` outline is in `app/globals.css`.
- Kanban edit fields have wrapping labels.
- Lint, typecheck, tests, and build pass.
- No health route, runbook, env, or major-upgrade changes.
