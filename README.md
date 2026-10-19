# NirmanKhata

Construction project monitoring for Nepali construction companies: projects, budgets,
order slips, deliveries, bills, payments and site reports.

- Requirements: [docs/requirements-v1.1.md](docs/requirements-v1.1.md)
- Technical design: [docs/technical-design.md](docs/technical-design.md)

## Stack

- `app/`: React + Vite + TypeScript PWA (Tailwind, TanStack Query, React Router)
- `supabase/`: Postgres schema, row-level security, RPC functions, Edge Functions, pgTAP tests

## Local setup

Needs Node 22, pnpm 11 and Docker.

```bash
pnpm install && pnpm --dir app install
pnpm db:start                 # local Supabase on ports 553xx
cp app/.env.example app/.env.local   # put the PUBLISHABLE_KEY from `pnpm exec supabase status`
pnpm dev                      # http://localhost:5173
```

Demo accounts (from `supabase/seed.sql`, loaded when the local database is first created), password `password123`:

| Mobile | Role | Sees |
|---|---|---|
| 9800000001 | Owner / Admin | everything |
| 9800000002 | Project Manager (+ money) | P-1, P-2 |
| 9800000003 | Site Staff | P-1, no amounts |
| 9800000004 | Accounts | all projects and amounts |
| 9800000005 | Viewer | P-2, no amounts |

The demo company also has three suppliers, slip OS-0001 (approved, 60 of 100 bags of cement
delivered to P-1), slip OS-0002 (sand, waiting for Sita's approval), bill 1187 posted by Gita
(Rs 59,325) and a Rs 40,000 payment against it, so the khata shows Rs 19,325 still owed.

Or register a new company at `/register`. Staff sign in with their mobile number and the password the admin gave them.

## Docker

```bash
pnpm db:start && pnpm docker:dev     # app in a container with hot reload, Supabase via the CLI
cp docker/.env.example docker/.env   # hosted Supabase URL + publishable key
pnpm docker:prod                     # nginx serving the production build on :8080
```

Production needs HTTPS in front (Caddy, Traefik or Cloudflare Tunnel) for the PWA install prompt and camera.
Test a running build with `E2E_BASE_URL=http://localhost:8080 pnpm --dir app e2e`.

## Tests

```bash
pnpm db:test                  # database: isolation, permissions, ledger invariants (pgTAP)
pnpm db:test:race             # concurrency: two real connections (double post, over-settle, retries)
pnpm --dir app test           # money, BS/AD dates, login IDs (Vitest)
pnpm --dir app e2e            # phone-screen walk-throughs: setup, and order -> deliver -> bill -> pay (Playwright; needs db + dev server)
```

After a schema change: `pnpm exec supabase migration up` then `pnpm db:types`. The local database is
shared between sessions: never run `supabase db reset` (see AGENTS.md).
