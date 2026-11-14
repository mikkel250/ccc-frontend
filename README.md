# CCC frontend

On-demand tailor UI and a signed-in Kanban of applied roles for the CCC API.

Gmail inbound drafts live in the [CCC](https://github.com/mikkel250/ccc) inbox worker, not here.

Next frontend `/lfg` after this board: **Gantt** and **nudges** stay parked. See [docs/plans/README.md](docs/plans/README.md).

Agent instructions: [AGENTS.md](AGENTS.md). Frontend strategy: [STRATEGY.md](STRATEGY.md). Domain terms: [CONCEPTS.md](CONCEPTS.md).

## Setup

Requires Node.js 22+ and Postgres 16 (Docker Compose is the local default).

```bash
cp .env.example .env
# Generate BETTER_AUTH_SECRET (openssl rand -base64 32).
# Set TAILOR_API_KEY (same secret as CCC).
# Point CCC_API_URL at a running CCC API.
# BETTER_AUTH_URL must match the browser origin (http://127.0.0.1:3000 locally).

docker compose up -d
npm install
npx prisma migrate deploy
npm run dev
```

`npm run dev` binds to **127.0.0.1** so the signed-in tailor proxy is not exposed on the LAN. This app defaults to port **3000**. Run CCC on **3001** (or set `CCC_API_URL`). Postgres is bound to **127.0.0.1:5432**.

```bash
# in the CCC repo
PORT=3001 npm run dev
```

Register the first operator at `/register`, then sign in. `/`, `/board`, and `POST /api/tailor` require that session. After a valid session, tailor and job mutations use a best-effort per-user window (`RATE_LIMIT_MAX` / `JOB_RATE_LIMIT_MAX`). That window is in-memory and process-local: it resets on restart and is not shared across instances. CCC’s hashed-secret bucket remains the tailor backstop. Sign-in and sign-up keep a coarse shared fallback that ignores client forwarding headers. After the first user exists, public registration is closed unless `ALLOW_REGISTRATION=true`.

`TAILOR_API_KEY`, `DATABASE_URL`, and Better Auth secrets are server-only. Do not prefix them with `NEXT_PUBLIC_`.

## Scripts

- `npm run dev` — local UI
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — unit tests (mocked CCC and Prisma; no live LLM)
- `npm run test:db` — Postgres job-position concurrency (local Compose only; not part of `npm test`)
- `npm run build` — `prisma generate` then production build

Pull requests and pushes to `main` run Prisma schema validation, lint, typecheck, tests, and the production build in GitHub Actions (`.github/workflows/ci.yml`). CI does not use GitHub secrets or a database.
