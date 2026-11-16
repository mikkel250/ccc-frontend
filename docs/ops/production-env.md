# Production environment

Host-agnostic catalog of every env var this Next.js process reads. Pick any host later; do not put secrets in `NEXT_PUBLIC_*` or the browser.

`GET /api/health` is liveness only: HTTP 200 `{ "ok": true }` with `Cache-Control: no-store`. It does not check Postgres, CCC, or whether secrets are set. A 200 means the Node process answered, not that tailor or sign-in will work.

Copy [`.env.example`](../../.env.example) as the starting list. Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. After the database URL is set, run `npx prisma migrate deploy` before serving traffic.

## Catalog

| Variable | Required | Default | If missing or invalid |
| --- | --- | --- | --- |
| `NODE_ENV` | Set by Next (`next start` → `production`) | `development` for `npm run dev` | Production rules below (`BETTER_AUTH_URL`, `RATE_LIMIT_ALLOW_PROCESS_LOCAL`, HSTS) do not apply outside production. Do not set this in `.env` unless you know you want those rules. |
| `DATABASE_URL` | Yes, for auth and the board | none (local example: Compose Postgres on `127.0.0.1:5432`) | Prisma queries fail. Sign-in, register, and `/board` error. Health still returns 200. |
| `BETTER_AUTH_SECRET` | Yes | none | Better Auth will not accept its built-in default in production. Sign-in and cookies fail. `next build` needs a placeholder secret; do not reuse the CI placeholder in a real host. |
| `BETTER_AUTH_URL` | Yes in production | `http://127.0.0.1:3000` outside production | Auth module throws `BETTER_AUTH_URL is required when NODE_ENV is production`. Must equal the browser origin (scheme + host + port, no trailing slash). Loopback `localhost` / `127.0.0.1` aliases are trusted together. A mismatch means cookies and CSRF fail. |
| `CCC_API_URL` | Yes for tailor | none | Process stays up. `POST /api/tailor` returns client-safe 503 `Tailor service is not configured.` Health stays 200. Board and auth still work. |
| `TAILOR_API_KEY` | Yes for tailor | none | Same 503 as missing `CCC_API_URL`. Server-only Bearer to CCC. Never `NEXT_PUBLIC_TAILOR_API_KEY`. |
| `CCC_FETCH_TIMEOUT_MS` | Optional | `95000` | Non-positive or non-numeric values use the default. Values above `95000` are clamped so a 30s body read plus the fetch still leave 5s to return 504 before `maxDuration` (130s). Fractions round. |
| `ALLOW_REGISTRATION` | Optional | unset / not `true` | First operator may register. After a user exists, further public sign-up is closed unless this is exactly `true`. Any other value keeps it closed. |
| `RATE_LIMIT_ALLOW_PROCESS_LOCAL` | Yes in production | ignored outside production (bucket on) | Startup (`instrumentation.ts`) throws unless the value is exactly `true` or `false`. `next build` skips this check (`NEXT_PHASE=phase-production-build`). `true`: in-memory per-user bucket (single instance only). `false`: bucket off; tailor returns 503 and job mutations return the same client-safe unavailable string (not a quota 429). Unset or any other value: process refuses to start. |
| `RATE_LIMIT_MAX` | Optional | `5` | Invalid or `< 1` falls back to `5`. Sliding window for authenticated `POST /api/tailor`, per session user id, process-local. |
| `RATE_LIMIT_WINDOW` | Optional | `60000` (ms) | Invalid or `< 1` falls back to `60000`. Shared window for tailor and job mutation buckets. |
| `JOB_RATE_LIMIT_MAX` | Optional | `30` | Invalid or `< 1` falls back to `30`. Sliding window for Kanban mutations, same window as tailor, process-local. |

## Production checklist

1. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` (public origin).
2. Set `RATE_LIMIT_ALLOW_PROCESS_LOCAL` to `true` (one Node process) or `false` (no in-memory bucket).
3. Set `CCC_API_URL` and `TAILOR_API_KEY` to the companion CCC API. Missing these does not crash boot; tailor returns 503 until they are set.
4. Leave `ALLOW_REGISTRATION` unset after the first operator exists, unless you intentionally want more accounts.
5. Run `npx prisma migrate deploy`, then `npm run build` and `npm run start` (or the host's equivalent).
6. Probe `GET /api/health` without cookies. Expect `{"ok":true}`. Then sign in and tailor once against real CCC.

## Secrets

`TAILOR_API_KEY`, `BETTER_AUTH_SECRET`, and `DATABASE_URL` are server-only. Do not prefix them with `NEXT_PUBLIC_`. This app is a Bearer presenter: the browser talks to `/api/tailor`; the server talks to CCC.
