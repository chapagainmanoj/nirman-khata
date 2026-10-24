# Ad pictures

Clean pictures for Facebook, Instagram and WhatsApp ads, in the site's look (Anek titles, Mukta text,
the real app screens of the sample company from `scripts/screenshots/`).

- `ad.html`: one page, two layouts: `?s=tall` (1080 × 1350, 4:5 feed) and `?s=sq` (1080 × 1080).
  Change the words or the screens here; open it in a browser to look while editing.
- `node scripts/ads/render.mjs` (from the repo root; needs `pnpm --dir site install`) writes the PNGs to
  `scripts/ads/out/` (not committed).

Keep the copy to what the site says: no price, no "free", no invented numbers. Contact details are
the ones in `site/src/content.ts`.
