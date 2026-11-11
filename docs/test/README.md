# Test

Test strategy notes for this frontend.

- `npm test` — unit tests with mocked CCC; no live LLM.
- `npm run lint` / `npm run typecheck` / `npm run build` — static checks.
- GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, and tests on pull requests and pushes to `main`. `npm ci` / `prisma generate` get a loopback `DATABASE_URL` only; tailor and Better Auth secrets are not injected.
- Local proof of tailor UI: `npm run dev` with CCC reachable at `CCC_API_URL`.
