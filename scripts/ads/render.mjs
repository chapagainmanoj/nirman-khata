// Renders ad.html to PNGs in scripts/ads/out/. Needs the site's packages (pnpm --dir site install).
// Run from the repo root: node scripts/ads/render.mjs
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../app/package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const page = new URL('ad.html', import.meta.url).href
const out = new URL('out/', import.meta.url).pathname
mkdirSync(out, { recursive: true })

const sizes = [['tall', 1080, 1350], ['sq', 1080, 1080]]
const browser = await chromium.launch()
for (const [s, width, height] of sizes) {
  const tab = await browser.newPage({ viewport: { width, height } })
  await tab.goto(`${page}?s=${s}`)
  await tab.evaluate(() => document.fonts.ready)
  const file = `${out}nirmankhata-ad-${width}x${height}.png`
  await tab.screenshot({ path: file })
  console.log(file)
}
await browser.close()
