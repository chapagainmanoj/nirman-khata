# NirmanKhata marketing site

The page at `nirman-khata.com/`. Astro + Tailwind, static HTML, no client JavaScript.

- Copy and contact details: `src/content.ts` (contacts also in `app/src/lib/contact.ts`; change both).
  No prices, testimonials or usage numbers until they exist (PRODUCT.md).
- Page: `src/pages/index.astro`; head, header and footer: `src/layouts/Base.astro`.
- Screenshots `public/screens/*.webp` and the link preview `public/og.png`: `scripts/screenshots/`.

```
pnpm install
pnpm dev          # http://localhost:4321 ("Sign in" goes to PUBLIC_APP_URL, e.g. http://localhost:5173)
pnpm build        # astro check + build to dist/
```

## How it shares the domain with the app
`scripts/build-deploy.sh` (root: `pnpm build:deploy`) copies `app/dist`, lays `dist/` over it and saves this
page as `site.html`. `public/_redirects` serves it at "/" only. Any other path that is not a file falls
through to the app (Cloudflare Pages serves `index.html`, the app shell, when there is no `404.html`).

Rules on Pages win over files, so a catch-all rule would hide robots.txt, the screenshots and the app's
assets. Pages also strips `.html` (`/index.html` → `/`), which is why the app's service worker caches its
shell as `app.html`. Built files go in `_site/`, apart from the app's `assets/`.

Check the merged folder the way Pages serves it: `npx wrangler pages dev deploy`.
