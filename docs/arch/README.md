# Architecture

Frontend + BFF for CCC on-demand tailor.

## Invariants

- Browser never holds `TAILOR_API_KEY`.
- Client → `POST /api/tailor` → CCC `POST /api/tailor-cv` with `curationMode: "strict"`.
- Missing `CCC_API_URL` / `TAILOR_API_KEY` fails closed with a client-safe error.
- Server logs go through `lib/safe-log.ts`. Do not log tokens, cookies, CV bytes, reply text, job descriptions, or API keys.
- `app/error.tsx` and `app/global-error.tsx` recover from render failures without showing `error.message`.
- Unsigned visitors to `/` and `/board` redirect to `/login`. Unauthenticated `POST /api/tailor` returns JSON 401 before rate-limit or CCC.
- Authenticated tailor and job mutations consume a best-effort per-user id bucket held in process memory. It resets on restart and is not shared across instances. CCC still receives loopback `x-forwarded-for` plus a server-set body `sessionId` (the session user id). Client `X-Forwarded-For` / body `sessionId` are ignored.
- Gmail / inbox worker is out of scope (companion CCC).

## Layout (M1)

```
app/
  page.tsx              # tailor form page
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
