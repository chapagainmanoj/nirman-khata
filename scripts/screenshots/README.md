# Landing page screenshots

The phone screenshots on the marketing site (`site/public/screens/*.webp`) and its link preview
(`site/public/og.png`) come from a sample company,
**Himali Nirman Sewa**, in the local database only. Re-take them when those screens change.

1. Local stack and dev server running (`pnpm db:start`, `pnpm dev`).
2. Load the company once (does nothing if it is already there):
   `PGPASSWORD=postgres psql -h localhost -p 55322 -U postgres -d postgres -f scripts/screenshots/company.sql`
3. Capture (needs `cwebp`: `brew install webp`): `node scripts/screenshots/capture.mjs`

Logins (password `password123`): 9800000091 owner, 9800000092 site staff, 9800000093 accounts.
The dashboard shows dates relative to today, so its "as of" date changes with each capture.
