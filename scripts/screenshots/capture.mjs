// Phone screenshots of the sample company for the marketing site (site/public/screens/*.webp) and its
// link preview image (site/public/og.png).
// Needs: the local stack and dev server running, scripts/screenshots/company.sql loaded, and cwebp
// (brew install webp). Run from the repo root: node scripts/screenshots/capture.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Playwright is installed in app/, not at the root.
const require = createRequire(new URL('../../app/package.json', import.meta.url))
const { chromium, devices } = require('@playwright/test')

const base = process.env.BASE_URL ?? 'http://localhost:5173'
const out = new URL('../../site/public/screens/', import.meta.url).pathname
const raw = mkdtempSync(join(tmpdir(), 'nk-shots-'))

const SHOTS = [
  { as: '9800000091', path: '/slips/a3000000-0000-0000-0000-000000000002', name: 'slip' },
  { as: '9800000092', path: '/deliveries/new', name: 'delivery' },
  { as: '9800000091', path: '/suppliers/a2000000-0000-0000-0000-000000000001', name: 'khata' },
  { as: '9800000091', path: '/dashboard', name: 'dashboard' },
]

const browser = await chromium.launch()
const pages = {}
async function signedIn(phone) {
  if (pages[phone]) return pages[phone]
  const page = await (await browser.newContext({ ...devices['Pixel 5'] })).newPage()
  await page.goto(`${base}/login`)
  await page.getByLabel('Mobile number or email').fill(phone)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/(dashboard|projects)$/)
  return (pages[phone] = page)
}

for (const shot of SHOTS) {
  const page = await signedIn(shot.as)
  await page.goto(base + shot.path)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800) // fonts and the last query
  const png = join(raw, `${shot.name}.png`)
  await page.screenshot({ path: png })
  // 720 px wide: sharp at the 300-340 px the site shows them (2x screens), still small on a weak network.
  execFileSync('cwebp', ['-quiet', '-q', '78', '-resize', '720', '0', png, '-o', join(out, `${shot.name}.webp`)])
  console.log(`screens/${shot.name}.webp`)
}

// The link preview (og:image, 1200 × 630): a ledger page with the dashboard in a phone.
const dashboard = readFileSync(join(raw, 'dashboard.png')).toString('base64')
const og = await (await browser.newContext({ viewport: { width: 1200, height: 630 } })).newPage()
await og.setContent(`<!doctype html><html><body style="margin:0">
  <div style="width:1200px;height:630px;box-sizing:border-box;position:relative;overflow:hidden;font-family:Mukta,system-ui,sans-serif;
    background:#faf7f1 repeating-linear-gradient(to bottom,transparent 0,transparent 41px,#e6dccb 41px,#e6dccb 42px)">
    <div style="position:absolute;left:72px;top:0;bottom:0;width:2px;background:#6a1f24;opacity:.55"></div>
    <div style="position:absolute;left:120px;top:120px;width:620px">
      <svg viewBox="0 0 64 64" width="72" height="72"><rect width="64" height="64" rx="14" fill="#6a1f24"/>
        <path d="M14 46V22l18-10 18 10v24M24 46V32h16v14" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></svg>
      <div style="margin-top:28px;font-size:30px;font-weight:600;color:#6a1f24">निर्माण खाता · NirmanKhata</div>
      <div style="margin-top:8px;font-size:76px;line-height:1.02;font-weight:700;color:#1f1f1f;letter-spacing:-1px">Site and office in one khata</div>
      <div style="margin-top:22px;font-size:28px;color:#55524c">Construction site and cost register for Nepal</div>
    </div>
    <div style="position:absolute;right:96px;top:58px;width:330px;padding:10px;border-radius:40px;background:#1f1f1f;transform:rotate(2deg)">
      <img src="data:image/png;base64,${dashboard}" style="display:block;width:100%;border-radius:31px"/>
    </div>
  </div></body></html>`)
await og.waitForTimeout(300)
await og.screenshot({ path: new URL('../../site/public/og.png', import.meta.url).pathname })
console.log('og.png')
await browser.close()
