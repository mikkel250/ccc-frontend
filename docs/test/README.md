# Test

Test strategy notes for this frontend.

- `npm test` — unit tests with mocked CCC; no live LLM. Error-boundary and `lib/safe-log` tests stay in this suite (no live UI server).
- `npm run lint` / `npm run typecheck` / `npm run build` — static checks.
- GitHub Actions (`.github/workflows/ci.yml`) runs `prisma validate`, lint, typecheck, tests, and `npm run build` on pull requests and pushes to `main`. Tailor and Better Auth secrets are not injected. The job also starts a `postgres:16` service (same image as `docker-compose.yml`), runs `prisma migrate deploy`, fails if `prisma migrate diff` shows the migrations differ from `schema.prisma`, and runs `npm run test:db`.
- `npm run test:db` — `tests/*.integration.ts` against real Postgres: the first-operator registration lock and the `(userId, status, position)` unique index under concurrency. Needs `DATABASE_URL` (env or `.env`) on loopback with migrations applied; `docker compose up -d postgres` locally. Not part of `npm test`.
- Local proof of tailor UI: `npm run dev` with CCC reachable at `CCC_API_URL`.
