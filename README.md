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

Demo accounts (from `supabase/seed.sql`, recreated by `pnpm db:reset`), password `password123`:

| Mobile | Role | Sees |
|---|---|---|
| 9800000001 | Owner / Admin | everything |
| 9800000002 | Project Manager (+ money) | P-1, P-2 |
| 9800000003 | Site Staff | P-1, no amounts |
| 9800000004 | Accounts | all projects and amounts |
| 9800000005 | Viewer | P-2, no amounts |

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
pnpm db:test                  # database: isolation, permissions, revisions (pgTAP)
pnpm --dir app test           # money, BS/AD dates, login IDs (Vitest)
pnpm --dir app e2e            # phone-screen walk-through (Playwright; needs db + dev server)
```

After a schema change: `pnpm db:reset` then `pnpm db:types`.
