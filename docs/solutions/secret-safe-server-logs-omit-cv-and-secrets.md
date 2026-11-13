---
module: lib/safe-log.ts
tags: [logging, secrets, bff]
problem_type: practice
created: 2026-11-13
---

# Secret-safe server logs omit CV text and secrets

## Problem

BFF and job-action failures used to be silent. A naive `console.error(error)` or request dump would print `TAILOR_API_KEY`, session cookies, job descriptions, and CV bytes — the same class of leak the client-safe CCC error allowlist already blocks in HTTP responses.

## Solution

Log one JSON object per event through `lib/safe-log.ts` (`formatSafeLog` / `safeLog`). Callers pass `level`, `event`, and non-sensitive fields (`status`, `hasApiUrl`, `errorName`). The formatter still redacts sensitive keys (`authorization`, `cookie`, `jobDescription`, `cv`, `replyText`, `sessionId`, `*token*`, `*secret*`, `*api-key*`), Bearer tokens, JWTs, and `TAILOR_API_KEY` / `BETTER_AUTH_SECRET` / `DATABASE_URL` substrings. Do not pass the request body or cookie header into the logger.

`app/error.tsx` and `app/global-error.tsx` may show `error.digest` for support. They must not render `error.message` or `error.stack`.

## See Also

- Architecture: [Frontend + BFF invariants](../arch/README.md)
- Client-safe CCC errors: `app/api/lib/ccc-tailor.ts` (`clientSafeError`)
