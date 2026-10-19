# AGENTS.md

NirmanKhata: construction project bookkeeping for Nepali contractors (projects, order slips,
deliveries, bills, payments, labour, site reports). Read before changing anything.

## Read first
- `PRODUCT.md`: who the users are. Site staff on low-end Android phones win any conflict.
- `GLOSSARY.md`: the domain words. Use them exactly in code, UI and docs; add new terms there.
- `docs/requirements-v1.1.md`: product decisions (confirmed). `docs/technical-design.md`: how it is built.
  Cite sections (`design §5.1`, `req §21`) in comments as the existing code does.

## Layout
- `app/`: React 19 + Vite + TypeScript PWA. Tailwind 4, TanStack Query, React Router, react-hook-form + zod.
  - `src/features/<module>/`: pages plus `api.ts` (queries, mutations). Database calls go in `api.ts`, not in pages.
  - `src/data/`: shared data plumbing: `rpc()`, `usePosting`, `saveUnlessSent` (`rpc.ts`), what may be shown
    (`permissions.ts`), what to fetch again after a change (`refresh.ts`).
  - `src/lib/`: money, dates (BS/AD), i18n, drafts, ids, errors. Pure, unit-tested.
  - `src/components/`: shared UI (`ui.tsx`, `MoneyInput`, `DateInput`, nav).
  - `src/platform/`: device APIs (storage, share). Use `platform`, never `window`/IndexedDB directly.
    Small settings read before first render (current project, accent) go in `platform.prefs`, not `localStorage`.
  - `e2e/`: Playwright on a Pixel 5 screen.
- `supabase/migrations/`: schema, RLS, RPC functions. The source of truth for the backend.
- `supabase/tests/`: pgTAP (`NNN_topic.sql`) plus shell tests for concurrency, files, export.
- `supabase/functions/`: Edge Functions (register, admin-users, company-export, files).

## Commands
Node 22, pnpm 11, Docker. Root: `pnpm install && pnpm --dir app install`.
| Task | Command |
|---|---|
| Start local Supabase | `pnpm db:start` (API 55321, DB 55322) |
| Apply new migrations | `pnpm exec supabase migration up` |
| Regenerate DB types | `pnpm db:types` (after any schema change) |
| Dev server | `pnpm dev` → http://localhost:5173 |
| Unit tests | `pnpm --dir app test` |
| Typecheck + build | `pnpm --dir app build` |
| Lint | `pnpm --dir app lint` |
| DB tests | `pnpm db:test`, `pnpm db:test:race`, `pnpm db:test:files`, `pnpm db:test:staff`, `pnpm db:test:export` |
| E2E | `pnpm --dir app e2e` (needs db + dev server) |
Demo logins: mobile `9800000001`–`9800000005`, password `password123` (roles in README).

## Local database: shared, be careful
- This project's Postgres is on **55322**. Port 54322 is a different project: never touch it.
- Several sessions share the local DB. **Never run `supabase db reset`.** Use `migration up`.
- To redo an edited, uncommitted migration: undo it by hand, delete its row from
  `supabase_migrations.schema_migrations`, then `migration up` again.

## Hard rules (money and data)
- **Money is integer paisa** (`bigint` in SQL, `number` in TS). Never floats. Parse input straight
  to paisa and format with `formatNPR` / `formatNPRShort` from `lib/money.ts` (`Rs. 12,34,567`).
- **Dates are stored as AD `date`.** BS is display/input only, via `lib/dates.ts`. "Today" is Asia/Kathmandu.
- **Nothing is deleted.** Records are deactivated, reversed or credited, with who/when kept.
- **Money visibility is server-side.** Financial values live only in finance tables behind RLS;
  reports and dashboards are RPCs. The UI must handle "amounts hidden" (`null` → "Not available").
- **Every tenant table** has `company_id`, `unique (company_id, id)` and composite FKs on
  `(company_id, x_id)`. Every view is `security_invoker = true` (a test enforces it).
- **Money-changing functions follow the posting contract** (design §5.1): authorize → check op_key
  → lock in global order (party, payments, documents, credits, delivery lines) → check state →
  write → check invariants → store result. Add a pgTAP test for each new one.
- **Derived values are never stored** (settlement status, received qty, fulfilment): views or RPCs.

## Frontend conventions
- Phone-first: large touch targets, little typing, works on weak networks. Check at 390px width.
  Exception: `/platform` is desktop-only (keep its link on the phone More page).
- All user-facing text goes through `t()` (`lib/i18n.ts`); English only for now, Nepali later.
- Client-generated ids and op_keys come from `newId()` (`lib/ids.ts`); a draft keeps its op_key until
  success, so retries and double taps are safe.
- Forms save drafts on the device through `lib/drafts.ts` (keyed by user + company).
- Show errors with `lib/errors.ts`, which maps constraint names to plain messages; add new ones there.
  SQL messages are shown only for our own codes (`P0001`, `P0002`, `22023` via `raise exception ... using errcode`);
  other database/PostgREST errors show a generic message. Edge Functions answer with `fail(message, status, code)`;
  give a new code words in `i18n.ts` as `function.<code>` and add it to `FUNCTION_CODES` in `lib/errors.ts`.
- Edge Functions check their body at run time with `_shared/validate.ts` (`text`, `flag`, `isUuid`, `uuidList`):
  a type annotation does not validate JSON, and `!!"false"` is true.
- After a mutation, `refresh(queryClient, ...changed)` from `data/refresh.ts` with every kind of data it changed
  (`'deliveries'`, `'ledger'`, ...). A new query family needs one line in `SHOWS` (a test fails until it has it).
  Don't await a wide refresh before the next UI step of a form (it reorders things on a slow phone).
- Simple by default: small contractors must not need accounting knowledge. Accountant detail goes
  in optional sections, never required fields.

## Adding a feature (typical path)
1. Migration `supabase/migrations/<YYYYMMDDHHMMSS>_<topic>.sql`: tables, RLS, RPCs.
2. pgTAP test `supabase/tests/NNN_<topic>.sql`: permissions, isolation between companies, invariants.
3. `pnpm exec supabase migration up` then `pnpm db:types`.
4. `features/<module>/api.ts` hooks, then the page; labels in `i18n.ts`.
5. Vitest for pure logic next to it (`*.test.ts`); Playwright spec in `app/e2e/` for the flow.
6. Update `GLOSSARY.md` / `docs/technical-design.md` if a term or rule changed.

## Gotchas
- `crypto.randomUUID` fails on a phone testing over the LAN (`http://192.168.x.x`, not a secure
  context). Always use `newId()`.
- A supplier bill total or payment amount is visible only to finance users who can see **every**
  project on it; unallocated payments and party balances are Admin/Accounts only (design §3.4).
- Site staff may see amounts on their own drafts and recent entries only (design §3.5, X1–X3).
- Reversing a document reverses its credits first, in the same transaction (design §5.4).
- Trip and Load quantities always need a vehicle note.
- Camera and the PWA install prompt need HTTPS outside localhost.
- CI runs e2e against `vite preview` (the build), not the dev server; a test passing in dev may still fail there.

## Before you say "done"
- `pnpm --dir app build`, `pnpm --dir app test`, `pnpm --dir app lint` pass.
- `pnpm db:test` passes if SQL changed; the relevant e2e spec passes if a flow changed.
- No new float maths on money, no untranslated strings, no `select` of finance tables that skips RLS.

## Git and deploy
- Work on `develop`. CI (`.github/workflows/ci.yml`) runs every test on PRs; a push to
  `master`/`main` deploys migrations, Edge Functions and the app (Cloudflare Pages). Don't push there casually.
- Never commit `.env`, `.env.local` or `docker/.env`.
