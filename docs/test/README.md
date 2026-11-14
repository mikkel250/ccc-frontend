# Test

Test strategy notes for this frontend.

- `npm test` — unit tests with mocked CCC; no live LLM. Error-boundary and `lib/safe-log` tests stay in this suite (no live UI server).
- `npm run lint` / `npm run typecheck` / `npm run build` — static checks.
- GitHub Actions (`.github/workflows/ci.yml`) runs `prisma validate`, lint, typecheck, tests, and `npm run build` on pull requests and pushes to `main`. `npm ci` / `prisma generate` get a loopback `DATABASE_URL` only; tailor and Better Auth secrets are not injected. The job does not start Postgres, so it does not replay migrations.
- Local proof of tailor UI: `npm run dev` with CCC reachable at `CCC_API_URL`.
