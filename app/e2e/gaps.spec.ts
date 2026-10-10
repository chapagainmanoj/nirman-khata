import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Milestone 6: lists load 50 at a time, the bill form shows the last billed rate, a refund
// from a supplier lowers the advance and cash paid, and an email login resets its own password.
const run = Date.now().toString().slice(-7)
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })
const email = `owner${run}@nirman.test`

// The test calls the same server functions the app does, as the signed-in owner, to set up
// 55 bills and a payment without typing them all.
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/s).slice(0, 2)))
const API = env.VITE_SUPABASE_URL as string
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY as string

async function token(page: Page) {
  return page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'))!
    return JSON.parse(localStorage.getItem(k)!).access_token as string
  })
}
async function rest(page: Page, path: string, body?: unknown) {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${await token(page)}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function signOut(page: Page) {
  // A form left unsaved (the rate hint check) may have autosaved a draft; signing out asks first.
  page.once('dialog', (d) => void d.accept())
  await page.goto('/more')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  return errors
}

test('paged lists, rate hint, refund and password reset', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = trackErrors(page)

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Gap Nirman ${run}`)
  await page.getByLabel('Your name').fill('Gita Owner')
  await page.getByLabel('Mobile number or email').fill(email)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Thapa house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('50,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Thapa house' })).toBeVisible()
  const projectId = page.url().split('/').at(-1)!

  await page.goto('/suppliers')
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByLabel('Business name').fill('Rai Traders')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link', { name: /Rai Traders/ }).click()
  const supplierId = page.url().split('/').at(-1)!

  // 55 posted bills of 10 bags at Rs. 450 (Rs. 4,500 each), then Rs. 2,50,000 paid without a project.
  const [company] = await rest(page, `projects?id=eq.${projectId}&select=company_id`)
  const [cement] = await rest(page, `materials?company_id=eq.${company.company_id}&name=eq.Cement&select=id,default_unit_id,default_heading_id`)
  for (let i = 1; i <= 55; i++) {
    const id = crypto.randomUUID()
    await rest(page, 'rpc/save_bill_draft', { p_bill: {
      id, supplier_id: supplierId, bill_no: `R-${i}`, bill_date: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`,
      lines: [{ project_id: projectId, heading_id: cement.default_heading_id, material_id: cement.id, qty: 10,
        unit_id: cement.default_unit_id, rate_paisa: 45000, amount_paisa: 450000, unmatched_reason: 'test' }],
    } })
    await rest(page, 'rpc/post_bill', { p_op_key: crypto.randomUUID(), p_bill: id })
  }
  await rest(page, 'rpc/record_payment', { p_op_key: crypto.randomUUID(), p_payment: {
    id: crypto.randomUUID(), supplier_id: supplierId, payment_date: '2026-10-01', amount_paisa: 25000000 } })

  // Bills: the tab counts every bill; the list loads 50 and "Show more" the rest.
  await page.goto('/bills')
  await page.getByRole('tab', { name: 'Posted (55)' }).click()
  const bills = page.getByRole('tabpanel').getByRole('listitem')
  await expect(bills).toHaveCount(50)
  await expect(page.getByText('Showing 50 of 55')).toBeVisible()
  await page.getByRole('button', { name: 'Show more' }).click()
  await expect(bills).toHaveCount(55)
  await expect(page.getByRole('button', { name: 'Show more' })).toBeHidden()
  await page.screenshot(shots('m6-01-bills-paged'))

  // The bill form shows the last billed rate and "Use" fills it in.
  await page.goto(`/bills/new?project=${projectId}`)
  await page.getByLabel('Supplier').selectOption({ label: 'Rai Traders' })
  await page.getByRole('button', { name: /Add material/ }).click()
  await page.getByLabel('Material', { exact: true }).selectOption({ label: 'Cement' })
  await expect(page.getByText(/Last billed Rs\. 450 on .* \(Bill R-\d+\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Use' }).click()
  await expect(page.getByLabel('Rate per unit')).toHaveValue('450')
  await page.screenshot(shots('m6-02-rate-hint'))

  // Refund: 55 × 4,500 = 2,47,500 billed, 2,50,000 paid, so Rs. 2,500 is held in advance.
  await page.goto(`/suppliers/${supplierId}`)
  const refundCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Refund received' }) })
  await expect(refundCard).toContainText('Rs. 2,500')
  await refundCard.getByRole('button', { name: 'Record refund' }).click()
  await expect(page.getByLabel('Amount received')).toHaveValue('2500')
  await page.getByLabel('Amount received').fill('3,000')
  await expect(page.getByText('No more than Rs. 2,500 here')).toBeVisible()
  await page.getByLabel('Amount received').fill('2,000')
  await page.getByLabel('Reference').fill('TXN-77')
  await page.screenshot(shots('m6-03-refund-form'))
  await page.getByRole('button', { name: 'Save refund' }).click()
  await expect(page.getByRole('heading', { name: 'Refund RF-0001' })).toBeVisible()
  await expect(page.getByText('Rs. 2,000').first()).toBeVisible()
  await page.screenshot(shots('m6-04-refund'))
  await page.goto(`/suppliers/${supplierId}`)
  await expect(refundCard).toContainText('Rs. 500')
  await expect(page.getByRole('link', { name: /Refund RF-0001/ })).toBeVisible() // in the khata
  await page.goto('/reports/payments?project=&from=2026-09-01')
  await expect(page.getByRole('region', { name: 'Report' }).getByRole('row').filter({ hasText: 'RF-0001 (refund)' })).toContainText('-Rs. 2,000')

  // Password reset by email: request, open the link from the mailbox, set a new password.
  await signOut(page)
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText('If this email has a login, a reset link is on its way.')).toBeVisible()
  let link = ''
  await expect.poll(async () => {
    const found = await (await fetch(`http://127.0.0.1:55324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()
    if (!found.messages?.length) return ''
    const msg = await (await fetch(`http://127.0.0.1:55324/api/v1/message/${found.messages[0].ID}`)).json()
    link = (msg.HTML as string).match(/href="([^"]*verify[^"]*)"/)?.[1].replaceAll('&amp;', '&') ?? ''
    return link
  }, { timeout: 15_000 }).toContain('type=recovery')
  await page.goto(link)
  await page.getByLabel('New password').fill('new-pass-22')
  await page.screenshot(shots('m6-05-new-password'))
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await signOut(page)
  await page.getByLabel('Mobile number or email').fill(email)
  await page.getByLabel('Password').fill('new-pass-22')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // A phone login is sent to its admin instead.
  await signOut(page)
  await page.goto('/forgot')
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Email').fill('9841000000')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText('You sign in with a mobile number. Ask your company admin to reset your password.')).toBeVisible()

  expect(errors).toEqual([])
})
