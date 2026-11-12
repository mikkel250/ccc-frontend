---
title: "Patch critical Next.js and better-auth advisories - Plan"
date: 2026-11-12
type: chore
topic: patch-critical-advisories
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Patch critical Next.js and better-auth advisories - Plan

## Goal Capsule

- **Objective:** The operator UI no longer ships with known critical/high advisories on `next` and `better-auth`, and weekly Dependabot PRs keep those packages from rotting.
- **Means:** Same-minor npm bumps (`next` 15.5.25 → 15.5.29, `better-auth` 1.7.3 → 1.7.21, `zod` → ≥4.6.6) plus `.github/dependabot.yml`. No product behavior change.
- **Product authority:** Nightly production-readiness pass. Open PRs #13, #16, #21, #22 are out of scope; do not build on or conflict with their files.
- **Open blockers:** None for this slice. Host/deploy, Prisma 7, and APM stay needs-user.
- **Tail:** Do not add security headers, error boundaries, CI workflows, rate limits, or Prisma major upgrades.

---

## Product Contract

### Summary

Patch the critical npm advisories on this app’s runtime (`next`, `better-auth`) and the high `zod` collection-DoS advisory, staying on the current majors. Add Dependabot so future advisories surface as PRs. Auth remains email/password, first-operator signup, session-gated tailor. No UI or API contract change.

### Key Decisions

- **Stay on Next.js 15.5 (Maintenance LTS), do not jump to 16.** `(session-settled: user-directed — nightly pass must not need owner decisions; a 16.x major is a product/hosting choice)` Governs R1, R4.
- **Stay on better-auth 1.7.x, do not jump to 1.8 beta.** `(session-settled: user-directed — same: no owner decision, compatible patched line exists)` Governs R2.
- **Do not conflict with open PRs #13, #16, #21, #22.** `(session-settled: user-directed — chosen over stacking on CI/rate-limit/jobs work)` Governs R5.
- **Prisma stays on 6.x.** `(session-settled: user-approved — Prisma 7 is a breaking major; skip)` Governs R4.

### Actors

- A1. Operator — unchanged sign-in, tailor, board.
- A2. This app’s server — Next.js 15.5.29 + better-auth 1.7.21.
- A3. Dependabot — opens weekly npm PRs.

### Requirements

- R1. `next` and `eslint-config-next` are pinned to the latest patched 15.5 release (15.5.29 as of 2026-11-12). Closes GHSA-2464-fhr4-w9xw (Image Optimization RCE), GHSA-p3m5-59mp-jv5r (Server Actions DoS), and the 15.5.27 cache-poisoning advisories.
- R2. `better-auth` and `@better-auth/memory-adapter` are pinned to the latest patched 1.7 release (1.7.21 as of 2026-11-12). Closes GHSA-965c-763c-88jm (critical OAuth-state-as-magic-link) and GHSA-r4xp-prcw-77qf, plus the 2026-11-03 1.7.16 security set.
- R3. Direct `zod` is ≥4.6.6 so GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized collections) is patched.
- R4. No major upgrades (Next 16, better-auth 1.8, Prisma 7). No product behavior, schema, or env-var changes.
- R5. Diff stays independent of open PRs: do not add `typecheck` / `.github/workflows/ci.yml` (#22), do not touch rate-limit / jobs / board placeholder files (#21, #13, #16). `package.json` changes are version pins only.
- R6. GitHub Dependabot watches the npm ecosystem weekly so future advisories become PRs.
- R7. Existing auth, registration-gate, session, and tailor tests still pass on the new packages.

### Key Flows

- F1. Sign-in / first-operator register / session-gated tailor
  - **Trigger:** Operator uses the existing UI.
  - **Steps:** Unchanged. Better Auth email/password + Prisma adapter; no OAuth, SSO, Expo, or magic-link plugins.
  - **Covered by:** R2, R4, R7.
- F2. Production build
  - **Trigger:** `npm run build`.
  - **Steps:** `prisma generate` then `next build --turbopack` on 15.5.29.
  - **Covered by:** R1, R4.
- F3. Dependabot
  - **Trigger:** Weekly GitHub schedule.
  - **Steps:** Dependabot opens PRs for npm updates under `/`.
  - **Covered by:** R6.

### Acceptance Examples

- AE1. Version floor
  - **Covers R1, R2, R3.**
  - **Given:** `package.json` on this branch.
  - **When:** The advisory-floor test reads `dependencies` / `devDependencies`.
  - **Then:** `next` and `eslint-config-next` are 15.5.29 (or later 15.5.x), `better-auth` and `@better-auth/memory-adapter` are 1.7.21 (or later 1.7.x), `zod` is ≥4.6.6.
- AE2. Auth still works in tests
  - **Covers R7.**
  - **Given:** Existing registration and session tests.
  - **When:** `npm test` runs.
  - **Then:** They pass without product-code changes.
- AE3. Dependabot config
  - **Covers R6.**
  - **Given:** `.github/dependabot.yml`.
  - **When:** The config test reads it.
  - **Then:** ecosystem is `npm`, directory `/`, interval `weekly`.
- AE4. `npm audit` after bump
  - **Covers R1, R2, R3.**
  - **Given:** Fresh lockfile.
  - **When:** `npm audit` is inspected.
  - **Then:** `next` is no longer listed as critical; `better-auth` is no longer listed as critical. Remaining items may include Prisma 7 (skipped) and transitive eslint/minimatch.

### Scope Boundaries

- In: `package.json` version pins, `package-lock.json`, `.github/dependabot.yml`, a small test that the floors and Dependabot config exist, this plan.
- Out: `next.config.ts` security headers, `app/error.tsx` / `global-error.tsx`, GitHub Actions CI, rate limiting, Prisma 7, Next 16, APM, skip-link, health check, prod env runbook.
- Do not edit files owned by open PRs unless unavoidable. Allowed overlap: `package.json` versions only (not the `typecheck` script from #22).

---

## Planning Contract

### Key Technical Decisions

- KTD1. Pin exact patched versions in `package.json` (`"15.5.29"`, `"1.7.21"`), matching how `next` is already pinned, not a caret that could float onto 16 later.
- KTD2. Keep `zod` on a caret at `^4.6.7` (latest 4.6 patch) so later 4.6.x patches install; the test floor is `>=4.6.6`.
- KTD3. Test floors by reading `package.json` (and Dependabot YAML as text). Do not scrape `npm audit` in CI — advisory IDs churn.
- KTD4. Dependabot: npm only, weekly, directory `/`. Do not add `github-actions` in this PR (CI workflow lives in unmerged #22).
- KTD5. No Prisma schema change. App is already on better-auth 1.7.3 (post-issuer-revert). Email/password only; 1.7.21 schema additions are for unused plugins (OAuth/SCIM/DPoP).
- KTD6. If `@better-auth/core/db/internal` imports in `tests/registration-integration.test.ts` break, update **tests only** to the new public/test API; do not change `lib/registration.ts` unless the plugin hook contract itself broke.

### Assumptions

- 15.5.29 remains the latest 15.5.x at implementation time; if a newer 15.5.x exists, pin that instead of 15.5.29.
- 1.7.21 remains the latest 1.7.x; if a newer 1.7.x exists, pin that instead of 1.7.21, still below 1.8.
- This app does not enable OAuth, Expo, phone, Stripe, or magic-link plugins. Several better-auth advisories therefore do not apply, but the same-minor bump is still the cheapest way to leave the affected range.
- Server Actions **are** used (`app/actions/jobs.ts`), so GHSA-p3m5-59mp-jv5r applies even without `next/image`.
- `npm audit` may still report Prisma/`deepmerge-ts` until Prisma 7 (out of scope) and some eslint-stack transitives.

### Sequencing

U1 failing version-floor test → U2 install patched packages → U3 Dependabot + test → U4 lint/typecheck/test/build.

---

## Implementation Units

### U1. Advisory version-floor test (red)

- **Goal:** A failing test that encodes R1–R3.
- **Files:** `tests/dependency-advisories.test.ts`.
- **Approach:** Read `package.json`. Compare `next`, `eslint-config-next`, `better-auth`, `@better-auth/memory-adapter`, `zod` against the floors. Use a tiny semver-major.minor.patch compare (no extra dep).
- **Done when:** `npm test -- tests/dependency-advisories.test.ts` fails because current pins are 15.5.25 / 1.7.3 / ^4.5.4.
- **Test scenarios:** AE1.

### U2. Patch packages (green)

- **Goal:** Install the patched versions and refresh the lockfile.
- **Files:** `package.json`, `package-lock.json`.
- **Approach:** `npm install next@15.5.29 eslint-config-next@15.5.29 better-auth@1.7.21 @better-auth/memory-adapter@1.7.21 zod@^4.6.7`. Do not add scripts. Do not touch `allowScripts` unless the installer requires it for a new exact prisma/esbuild version (should not).
- **Done when:** U1 test passes. Existing tests still pass.
- **Test scenarios:** AE1, AE2, AE4 (manual audit inspect).

### U3. Dependabot

- **Goal:** Weekly npm update PRs.
- **Files:** `.github/dependabot.yml`, same test file.
- **Approach:** `version: 2`, one `updates` entry: `package-ecosystem: npm`, `directory: "/"`, `schedule.interval: weekly`. Assert that shape in the test.
- **Done when:** AE3 passes.
- **Test scenarios:** AE3.

### U4. Verify

- **Goal:** Gates pass on this branch.
- **Files:** none new.
- **Approach:** `npm run lint`, `npx tsc --noEmit` (do not add a `typecheck` script — #22 owns that), `npm test`, `npm run build` if env allows.
- **Done when:** all four are green, or build failure is documented as env-only.

---

## Verification Contract

- `npm test` — includes the new floor test and the existing suite (mocked CCC; no live LLM).
- `npm run lint`
- `npx tsc --noEmit` — do not add `package.json` `typecheck` (open PR #22).
- `npm run build` — `prisma generate` then production build.
- After install: `npm audit` inspected; `next` and `better-auth` no longer critical.
- Do not call live CCC.

---

## Definition of Done

- U1–U4 complete.
- `package.json` pins `next`/`eslint-config-next` to latest 15.5.x and `better-auth`/`@better-auth/memory-adapter` to latest 1.7.x; `zod` ≥4.6.6.
- `.github/dependabot.yml` watches npm weekly.
- Lint, `tsc --noEmit`, tests, and `next build` pass.
- No product behavior, schema, or env-var changes.
- No files from PRs #13, #16, #21, #22 except version fields in `package.json`.

## Confidence

- **Implementation:** High — version pins plus a config file.
- **Integration:** Medium — better-auth test internals (`@better-auth/core/db/internal`) may need a test-only update on 1.7.21.
- **Product:** High — no operator-visible change.
