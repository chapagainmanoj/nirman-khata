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

Register a company at `/register`, then add staff from the Staff page.
Staff sign in with their mobile number and the password the admin gave them.

## Tests

```bash
pnpm db:test                  # database: isolation, permissions, revisions (pgTAP)
pnpm --dir app test           # money, BS/AD dates, login IDs (Vitest)
pnpm --dir app e2e            # phone-screen walk-through (Playwright; needs db + dev server)
```

After a schema change: `pnpm db:reset` then `pnpm db:types`.
