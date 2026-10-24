#!/usr/bin/env bash
# One Cloudflare Pages deploy for nirman-khata.com: the app build with the marketing site laid over it.
#   /                 the site (site.html, by the rule in site/public/_redirects)
#   robots.txt, sitemap.xml, og.png, screens/, _site/   the site's files
#   everything else   the app: Pages serves index.html (the app shell) for any path that is not a file;
#                     the service worker uses the same shell saved as app.html (app/vite.config.ts)
# Builds must already exist (pnpm build:deploy makes both).
set -euo pipefail
cd "$(dirname "$0")/.."

for f in app/dist/index.html app/dist/app.html site/dist/index.html site/dist/_redirects; do
  [ -f "$f" ] || { echo "missing $f: build the app and the site first" >&2; exit 1; }
done
# The site must not bring files the app owns, or a 404.html (which would turn off the app's fallback).
for f in assets sw.js manifest.webmanifest registerSW.js app.html 404.html site.html; do
  [ -e "site/dist/$f" ] && { echo "site/dist/$f would replace or break the app" >&2; exit 1; }
done

rm -rf deploy
mkdir deploy
cp -R app/dist/. deploy/
cp -R site/dist/. deploy/
mv deploy/index.html deploy/site.html
cp app/dist/index.html deploy/index.html

# A broken merge must fail here, not on the live site.
cmp -s deploy/index.html app/dist/index.html || { echo "deploy/index.html is not the app shell" >&2; exit 1; }
cmp -s deploy/app.html app/dist/app.html || { echo "deploy/app.html is not the app shell" >&2; exit 1; }
cmp -s deploy/site.html site/dist/index.html || { echo "deploy/site.html is not the site" >&2; exit 1; }
[ ! -e deploy/404.html ] || { echo "deploy/404.html would turn off the app's fallback" >&2; exit 1; }
echo "deploy/ ready: site at /, app everywhere else"
