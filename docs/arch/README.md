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
- Root layout ships a skip-to-content link targeting `#main-content`. Layout-backed pages put that id on `<main>` with `tabIndex={-1}`. `:focus-visible` outline lives in `app/globals.css`.
- Gmail / inbox worker is out of scope (companion CCC).

## Layout (M1)

```
app/
  page.tsx              # tailor form page
  skip-to-content.tsx   # skip link targeting #main-content
  tailor-form.tsx       # client form + download / reply display
  error.tsx             # route error boundary
  global-error.tsx      # root error boundary
  api/
    tailor/route.ts     # BFF route
    lib/ccc-tailor.ts   # CCC client + client-safe errors
lib/
  safe-log.ts           # JSON logs with secret redaction
tests/
  ccc-tailor.test.ts    # mocked CCC
```

## Related

- Contract: [../api/API.md](../api/API.md)
- Build order: [../plans/README.md](../plans/README.md)
- Agent rules: [../../AGENTS.md](../../AGENTS.md)
