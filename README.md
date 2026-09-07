# CCC frontend

On-demand tailor UI for the CCC API: paste a JD, download a `.docx`, read the recruiter reply.

Gmail inbound drafts live in the [CCC](https://github.com/mikkel250/ccc) inbox worker, not here.

Next frontend `/lfg`: **Kanban job tracker** (applied roles). Gantt and follow-up nudges are parked until that board exists. See [docs/plans/README.md](docs/plans/README.md).

## Setup

Requires Node.js 22+.

```bash
cp .env.example .env.local
# Set TAILOR_API_KEY (same secret as CCC).
# Point CCC_API_URL at a running CCC API.
# For any non-loopback / production deploy, also set OPERATOR_TOKEN.
npm install
npm run dev
```

`npm run dev` binds to **127.0.0.1** so the unauthenticated local proxy is not exposed on the LAN. This app defaults to port **3000**. Run CCC on **3001** (or set `CCC_API_URL`).

Production (`next start` / a hosted deploy) **requires** `OPERATOR_TOKEN`. Paste the same value in the Operator token field; it is sent as `x-operator-token` and is never prefixed with `NEXT_PUBLIC_`.

```bash
# in the CCC repo
PORT=3001 npm run dev
```

## Scripts

- `npm run dev` — local UI
- `npm test` — unit tests (mocked CCC; no live LLM)
- `npm run build` — production build

`TAILOR_API_KEY` and `OPERATOR_TOKEN` are server-only. Do not prefix them with `NEXT_PUBLIC_`.
