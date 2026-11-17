# Architecture

Frontend + BFF for CCC on-demand tailor.

## Invariants

- Browser never holds `TAILOR_API_KEY`.
- Client → `POST /api/tailor` → CCC `POST /api/tailor-cv` with `curationMode: "strict"`.
- Missing `CCC_API_URL` / `TAILOR_API_KEY` fails closed with a client-safe error.
- Server logs go through `lib/safe-log.ts`. Do not log tokens, cookies, CV bytes, reply text, job descriptions, or API keys.
- `app/error.tsx` and `app/global-error.tsx` recover from render failures without showing `error.message`.
- Unsigned visitors to `/` and `/board` redirect to `/login`. Unauthenticated `POST /api/tailor` returns JSON 401 before rate-limit or CCC.
- Authenticated tailor and job mutations consume a best-effort per-user id bucket held in process memory. It resets on restart and is not shared across instances. Production startup (`instrumentation.ts`) requires `RATE_LIMIT_ALLOW_PROCESS_LOCAL` to be `true` or `false`. `true` uses the memory bucket on a single instance. `false` leaves it off: tailor returns 503 and job actions return the same client-safe unavailable string, distinct from a quota 429. Any other value, including unset, stops the server from starting. A request that still reaches the limiter with invalid config fails closed the same way. CCC still receives loopback `x-forwarded-for` plus a server-set body `sessionId` (the session user id). Client `X-Forwarded-For` / body `sessionId` are ignored.
- Browser responses set CSP (`connect-src 'self'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `Referrer-Policy`, `X-Content-Type-Options: nosniff`, and `Permissions-Policy`. Production also sends HSTS. `next.config.ts` hides `X-Powered-By`. Nonce-based CSP is deferred (it would force dynamic rendering).
- Gmail / inbox worker is out of scope (companion CCC).

## Layout

```
app/
  page.tsx, tailor-form.tsx          # on-demand tailor UI
  board/page.tsx, board/kanban-board.tsx
  login/, register/, sign-out-button.tsx
  actions/jobs.ts                    # job server actions
  api/tailor/route.ts, api/auth/[...all]/route.ts
  api/lib/ccc-tailor.ts, tailor-post.ts
  error.tsx, global-error.tsx, layout.tsx
lib/
  auth.ts, auth-client.ts, session.ts, registration.ts
  jobs.ts, job-actions.ts, prisma.ts, rate-limit.ts
  safe-log.ts, security-headers.ts
middleware.ts                        # cookie gate on /, /board/*
prisma/schema.prisma
tests/                               # node:test (mocked CCC, no live DB in unit runs)
```

## Related

- Contract: [../api/API.md](../api/API.md)
- Build order: [../plans/README.md](../plans/README.md)
- Agent rules: [../../AGENTS.md](../../AGENTS.md)
