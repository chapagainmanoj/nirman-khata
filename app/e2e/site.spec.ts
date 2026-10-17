import { expect, test, type Page } from '@playwright/test'

// Milestone 4 walk-through on a phone: stages from the list, "+" -> Daily report on the current
// project with a photo, labour paid now and the day's delivery shown (acceptance #23); progress
// 40% beside 65% of budget used (acceptance #10); the calendar day in BS and AD (acceptance #11);
// with own labour off, labour leaves the menus and the report form.
const run = Date.now().toString().slice(-7)
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  page.on('response', async (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()} ${await r.text().catch(() => '')}`)
  })
  return errors
}

test('daily report, progress and calendar on a phone', async ({ page }) => {
  const errors = trackErrors(page)

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Site Nirman ${run}`)
  await page.getByLabel('Your name').fill('Gita Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 985${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  // Budget is pre-filled from the contract: 10,00,000.
  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Bhandari house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('10,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Bhandari house' })).toBeVisible()
  const projectUrl = page.url()
  const projectId = projectUrl.split('/').at(-1)!

  // Stages from the common list.
  await page.getByRole('tab', { name: 'Site' }).click()
  await page.getByRole('button', { name: 'Set up stages' }).click()
  await page.getByLabel('Plaster').uncheck()
  await page.getByRole('button', { name: 'Add stages' }).click()
  // The progress list row, not the setup form's own checkbox, which also says Foundation.
  await expect(page.getByRole('progressbar', { name: 'Foundation progress' })).toBeVisible()
  await expect(page.getByText('Plaster', { exact: true })).toHaveCount(0)

  // A delivery recorded earlier today, without a slip.
  await page.goto('/suppliers')
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByLabel('Business name').fill('Pokhara Cement Traders')
  await page.getByLabel('Materials supplied').fill('Cement')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /Pokhara Cement Traders/ })).toBeVisible()
  await page.goto(`/deliveries/new?project=${projectId}`)
  await page.getByLabel('Supplier').selectOption({ label: 'Pokhara Cement Traders' })
  await page.getByLabel('Why no order slip?').fill('Urgent for the footing')
  await page.getByLabel('Material', { exact: true }).selectOption({ label: 'Cement' })
  await page.getByRole('textbox', { name: 'Received', exact: true }).fill('60')
  await page.getByRole('button', { name: 'Save delivery' }).click()
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toBeVisible()
  // The dashboard names what came without a bill and offers to enter it.
  await page.goto('/dashboard')
  const unbilled = page.getByRole('link', { name: /^60 .*Cement from Pokhara Cement Traders, came today; no bill yet/ })
  await expect(unbilled).toContainText('Enter bill')
  await expect(unbilled).toHaveAttribute('href', /\/bills\/new\?supplier=/)

  // "+" -> Daily report starts on the current (only) project.
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.getByRole('dialog', { name: 'Record' }).getByRole('link', { name: /Daily report/ }).click()
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue(projectId)
  // The date calendar floats over the form instead of pushing it down; Escape closes it.
  const photos = page.getByRole('heading', { name: 'Photos' })
  // Measured on the page, not the window: opening may scroll to show the calendar, which is fine.
  const pageY = () => photos.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
  const before = await pageY()
  await page.locator('#dr-date').click()
  const picker = page.getByRole('dialog', { name: 'Choose date' })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('button', { pressed: true, name: / · / })).toBeFocused()
  expect(await pageY()).toBe(before)
  await page.screenshot(shots('m4-00-date-popup'))
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(page.locator('#dr-date')).toBeFocused()
  // The delivery is already there; nothing to type again (acceptance #23).
  await expect(page.getByText('Already recorded, so there is no need to enter them again.')).toBeVisible()
  await expect(page.getByText(/Cement 60/)).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Take site photo' }).click()
  await (await chooser).setFiles({ name: 'site.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await expect(page.getByRole('img', { name: 'Site photo 1 of 1' })).toBeVisible()
  await page.getByLabel('Work done').fill('Footing concrete, grid A-C')
  await page.getByLabel('People on site').fill('12')
  await page.getByLabel('Stage').selectOption({ label: 'Foundation' })
  await page.getByLabel("Add the day's labour cost").check()
  await page.getByLabel('Crew', { exact: true }).selectOption({ label: 'Site crew' })
  await page.getByLabel('Labour cost for the day').fill('6,50,000')
  await expect(page.getByLabel('Paid now')).toBeChecked()
  await page.screenshot(shots('m4-01-daily-report'))
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByRole('heading', { name: 'Report sent' })).toBeVisible()
  await expect(page.getByText(/Labour Rs\. 6,50,000: paid now \(PAY-0001\)/)).toBeVisible()
  await page.getByRole('link', { name: 'Open report' }).click()
  await expect(page.getByText('Footing concrete, grid A-C')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Site photo 1 of 1' })).toBeVisible()
  await page.screenshot(shots('m4-02-report-detail'))

  // Progress 40% overall; 65% of budget is used. Two separate figures (acceptance #10).
  await page.goto(`${projectUrl}?tab=site`)
  await page.getByRole('button', { name: 'Update progress: Overall' }).click()
  await page.getByLabel('Progress %').fill('40')
  await page.getByRole('button', { name: 'Save progress' }).click()
  await expect(page.getByRole('progressbar', { name: 'Overall progress' })).toHaveAttribute('aria-valuenow', '40')
  const summary = page.getByRole('region', { name: 'Summary' })
  await expect(summary).toContainText('40%')
  await expect(summary).toContainText('of Rs. 10,00,000 budget')
  await expect(summary.getByRole('progressbar', { name: 'Budget used' })).toHaveAttribute('aria-valuenow', '65')
  await expect(page.getByRole('link', { name: /Footing concrete/ })).toBeVisible()
  await page.screenshot(shots('m4-03-site-tab'))

  // Calendar: today shows the report, progress, delivery, labour cost and its payment.
  await page.goto('/calendar')
  await expect(page.getByRole('link', { name: /Daily report: Footing concrete/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Progress: Overall 40%/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Delivery/ }).first()).toBeVisible()
  await expect(page.getByText('Cost Rs. 6,50,000').first()).toBeVisible()
  await expect(page.getByText('Paid Rs. 6,50,000').first()).toBeVisible()
  const bsTitle = await page.getByRole('button', { name: 'Previous month' }).locator('..').textContent()
  await page.screenshot(shots('m4-04-calendar-bs'))
  await page.getByRole('radio', { name: 'AD' }).click()
  await expect(page.getByRole('button', { name: 'Previous month' }).locator('..')).not.toHaveText(bsTitle ?? '')
  await expect(page.getByRole('link', { name: /Daily report: Footing concrete/ })).toBeVisible()
  await page.screenshot(shots('m4-05-calendar-ad'))

  // Own labour off: no labour in "+", in the report form, or on the project.
  await page.goto('/settings')
  const work = page.locator('section', { has: page.getByRole('heading', { name: 'How you work' }) })
  await work.getByLabel('Track own labour (jyala)').uncheck()
  await expect(work.getByText('Saved.')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Record' })
  await expect(sheet.getByRole('link', { name: /Daily report/ })).toBeVisible()
  await expect(sheet.getByRole('link', { name: /labour/i })).toHaveCount(0)
  await sheet.getByRole('link', { name: /Daily report/ }).click()
  await expect(page.getByLabel('Work done')).toBeVisible()
  await expect(page.getByLabel("Add the day's labour cost")).toHaveCount(0)
  await page.goto(projectUrl)
  await expect(page.getByRole('tab', { name: 'Other costs' })).toBeVisible()

  // Nothing scrolls sideways on the phone.
  await page.goto('/calendar')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

  expect(errors).toEqual([])
})
