# Architecture

Frontend + BFF for CCC on-demand tailor.

## Invariants

- Browser never holds `TAILOR_API_KEY`.
- Client → `POST /api/tailor` → CCC `POST /api/tailor-cv` with `curationMode: "strict"`.
- Missing `CCC_API_URL` / `TAILOR_API_KEY` fails closed with a client-safe error.
- Gmail / inbox worker is out of scope (companion CCC).

## Layout (M1)

```
app/
  page.tsx              # tailor form page
  tailor-form.tsx       # client form + download / reply display
  api/
    tailor/route.ts     # BFF route
    lib/ccc-tailor.ts   # CCC client + client-safe errors
tests/
  ccc-tailor.test.ts    # mocked CCC
```

## Related

- Contract: [../api/API.md](../api/API.md)
- Build order: [../plans/README.md](../plans/README.md)
- Agent rules: [../../AGENTS.md](../../AGENTS.md)
