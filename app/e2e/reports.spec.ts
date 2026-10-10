import { expect, test, type Page } from '@playwright/test'
import { signOut } from './helpers'
import { readFileSync } from 'node:fs'

// Milestone 5 on a phone and a desktop: the dashboard after sign-in, the project's recorded
// cost with what is still missing, reports that agree with the dashboard (acceptance #14),
// Excel and print export, and the admin's full company export.
const run = Date.now().toString().slice(-7)
const kathmandu = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' })
const today = kathmandu(Date.now())
const tomorrow = kathmandu(Date.now() + 86_400_000)
const staffPhone = `+977 985${run}`
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  page.on('response', async (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()} ${await r.text().catch(() => '')}`)
  })
  return errors
}

test('dashboard, reports and exports agree', async ({ page }) => {
  const errors = trackErrors(page)

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Report Nirman ${run}`)
  await page.getByLabel('Your name').fill('Hari Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 986${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Karki house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('10,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Karki house' })).toBeVisible()
  const projectId = page.url().split('/').at(-1)!

  // Labour paid now (cost and cash), and a daily report.
  await page.goto(`/labour/new?project=${projectId}`)
  await page.getByLabel('Crew', { exact: true }).selectOption({ label: 'Site crew' })
  await page.getByLabel('Labour cost for the day').fill('6,000')
  await page.getByRole('button', { name: 'Save labour' }).click()
  await expect(page.getByRole('heading', { name: 'Labour saved' })).toBeVisible()
  await page.goto(`/daily/new?project=${projectId}`)
  await page.getByLabel('Work done').fill('Site cleared, layout marked')
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByRole('heading', { name: 'Report sent' })).toBeVisible()

  // "/" is the dashboard for the owner.
  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard$/)
  const totals = page.getByRole('region', { name: 'Totals' })
  await expect(totals).toContainText('Rs. 6,000')
  await expect(page.getByRole('progressbar', { name: 'Budget used' })).toBeVisible()
  // Work done is kept apart from budget used; with no progress entered it offers a way to set it.
  await expect(page.getByRole('link', { name: /Set progress/ })).toHaveAttribute('href', `/projects/${projectId}?tab=site`)
  await page.screenshot(shots('m5-01-dashboard'))

  // Project page: recorded cost by heading and by source.
  await page.getByRole('link', { name: /P-1 · Karki house/ }).click()
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('Recorded cost')
  await expect(page.getByRole('heading', { name: 'Cost by heading' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Own labour' }).filter({ hasText: 'Rs. 6,000' }).first()).toBeVisible()
  await page.screenshot(shots('m5-02-project'))

  // Budget revised from tomorrow, with a labour heading budget (#19).
  await page.goto(`/projects/${projectId}?tab=history`)
  await page.getByRole('button', { name: 'Revise budget' }).click()
  await page.getByLabel('Total budget').fill('12,00,000')
  await page.getByRole('button', { name: 'BS, switch to AD calendar' }).last().click()
  await page.locator('#rev-date').fill(tomorrow)
  await page.getByLabel('Reason').fill('Extra floor')
  await page.getByLabel('Split by cost heading (optional)').check()
  await page.getByLabel('Own Labour (Jyala)').fill('5,000')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Extra floor')).toBeVisible()

  // Reports agree with the dashboard (#14).
  await page.goto('/reports')
  await page.getByRole('link', { name: /Cost by heading/ }).click()
  const report = page.getByRole('region', { name: 'Report' })
  await expect(report.getByRole('cell', { name: 'Rs. 6,000' }).first()).toBeVisible()

  // As of today the original budget applies (no heading budget); as of tomorrow, the revision.
  await page.goto(`/reports/budget-vs-cost?project=&asOf=${today}`)
  await expect(report).toContainText('budget revision of')
  await expect(report.getByRole('row').filter({ hasText: 'Own Labour' })).not.toContainText('Rs. 5,000')
  const asOfToday = await report.locator('p').first().textContent()
  await page.goto(`/reports/budget-vs-cost?project=&asOf=${tomorrow}`)
  await expect(report.getByRole('row').filter({ hasText: 'Own Labour' })).toContainText('Rs. 5,000')
  await expect(report.getByRole('row').filter({ hasText: 'Own Labour' })).toContainText('-Rs. 1,000')
  expect(await report.locator('p').first().textContent()).not.toBe(asOfToday)

  await page.goto('/reports/payments?project=')
  await expect(report.getByRole('row').filter({ hasText: 'PAY-0001' })).toContainText('Rs. 6,000')
  await page.screenshot(shots('m5-03-payment-register'))

  // Excel download, then the print layout without the app's navigation.
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel' }).click()
  const xlsx = await download
  expect(xlsx.suggestedFilename()).toMatch(/^payments-.*\.xlsx$/)
  expect(readFileSync(await xlsx.path()).subarray(0, 2).toString()).toBe('PK') // a zip, as .xlsx files are
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  await expect(page.getByText(/Printed .* from NirmanKhata/)).toBeVisible()
  await page.screenshot(shots('m5-04-print'))
  await page.emulateMedia({ media: 'screen' })

  // The admin's full export: one zip.
  await page.goto('/settings')
  const exportDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download export' }).click()
  const zip = await exportDownload
  expect(zip.suggestedFilename()).toMatch(/^nirmankhata-export-.*\.zip$/)
  const bytes = readFileSync(await zip.path())
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  expect(bytes.includes(Buffer.from('manifest.json'))).toBe(true)

  // Nothing scrolls sideways on the dashboard or a report.
  for (const size of [{ width: 393, height: 851 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size)
    for (const path of ['/dashboard', '/reports/project-cost']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} at ${size.width}px`).toBeLessThanOrEqual(0)
    }
    await page.screenshot(shots(`m5-05-report-${size.width}`))
  }

  // Site staff: reports without amounts, and "/" is the project list.
  await page.goto('/staff')
  await page.getByRole('button', { name: 'Add staff' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Sita Supervisor')
  await page.getByLabel('Mobile number or email').fill(staffPhone)
  await page.getByLabel('Starting password').fill('staff-pass-1')
  await page.getByLabel('P-1 · Karki house').check()
  await page.locator('form').getByRole('button', { name: 'Add staff' }).click()
  await expect(page.getByText('Sita Supervisor')).toBeVisible()
  await signOut(page)
  await page.getByLabel('Mobile number or email').fill(staffPhone)
  await page.getByLabel('Password').fill('staff-pass-1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await page.goto('/reports')
  await expect(page.getByRole('link', { name: /Daily activity/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Payment register|Cost by heading|ledger/ })).toHaveCount(0)
  await page.getByRole('link', { name: /Daily activity/ }).click()
  await expect(page.getByRole('region', { name: 'Report' })).toContainText('Site cleared')
  await expect(page.getByText('Rs.')).toHaveCount(0)
  await page.goto('/reports/payments')
  await expect(page.getByText('Report not found')).toBeVisible()
  await page.screenshot(shots('m5-06-staff-reports'))

  expect(errors).toEqual([])
})
