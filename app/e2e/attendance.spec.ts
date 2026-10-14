import { expect, test, type Page } from '@playwright/test'

// Attendance on a phone (req §14, company setting "Labour by: Attendance"): workers with a daily or
// hourly rate on the project's Site crew, "Everyone in", one exception, close the day paid now; then
// a worker brought in on another project for a day, which that project's crew is owed.
const run = Date.now().toString().slice(-7)
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  return errors
}

async function newProject(page: Page, code: string, name: string) {
  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill(code)
  await page.getByLabel('Project name').fill(name)
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('10,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  return page.url().split('/').at(-1)!
}

async function addWorker(page: Page, name: string, by: 'Day' | 'Hour', rate: string) {
  await page.getByRole('button', { name: 'Add worker' }).click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('radio', { name: by }).click()
  await page.getByLabel(by === 'Day' ? 'Rate for a full day' : 'Rate for an hour').fill(rate)
  await page.getByRole('button', { name: 'Add worker' }).last().click()
  await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
}

test('attendance: mark the day, close it, bring a worker to another project', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Hajiri Nirman ${run}`)
  await page.getByLabel('Your name').fill('Gita Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 984${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()
  const bhandari = await newProject(page, 'P-1', 'Bhandari house')

  // Settings: labour by attendance, under "Track own labour".
  await page.goto('/settings')
  const work = page.locator('section', { has: page.getByRole('heading', { name: 'How you work' }) })
  await work.getByRole('radio', { name: 'Attendance' }).click()
  await expect(work.getByText('Saved.')).toBeVisible()
  await expect(work.getByLabel('Paid hours')).toHaveValue('480')
  await page.reload()

  // "+" offers Attendance instead of a typed labour cost.
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Record' })
  await sheet.getByRole('link', { name: /Attendance/ }).click()
  await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible()
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue(bhandari)

  // Workers are added from the roster: a mistri by the day, a helper by the hour.
  await addWorker(page, 'Ram Bahadur', 'Day', '1,200')
  await addWorker(page, 'Gopal Rai', 'Hour', '150')

  // One tap for the normal day, then Gopal stays an hour longer.
  await page.getByRole('button', { name: /^Everyone in/ }).click()
  await expect(page.getByRole('button', { name: /^Ram Bahadur/ })).toContainText('Here · 8 h')
  await expect(page.getByRole('button', { name: /^Gopal Rai/ })).toContainText('Here · 8 h')
  await page.getByRole('button', { name: /^Gopal Rai/ }).click()
  await page.getByRole('button', { name: '+1 hour' }).click()
  await expect(page.getByRole('button', { name: /^Gopal Rai/ })).toContainText('9 h · 08:00–18:00')
  // Ram 1,200 for a full day; Gopal 9 h × 150 = 1,350.
  await expect(page.getByText(/2 here · 17 h · Rs\. 2,550/)).toBeVisible()
  await page.screenshot(shots('att-01-roster'))

  // Close the day, paid now.
  await page.getByRole('button', { name: 'Close day' }).click()
  const closeCard = page.locator('section', { has: page.getByRole('heading', { name: /^Close today/ }) })
  await expect(closeCard.getByLabel('Paid now')).toBeChecked()
  await closeCard.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText(/Day closed: Rs\. 2,550 labour cost for the crew\. Paid now/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Ram Bahadur/ })).toBeDisabled()
  await page.goto(`/projects/${bhandari}?tab=labour`)
  await expect(page.getByText('Rs. 2,550').first()).toBeVisible()

  // Yesterday Ram worked at Lakeside: brought in on Lakeside's crew, who are owed his day.
  const lakeside = await newProject(page, 'P-2', 'Lakeside')
  const yesterday = new Date(Date.now() + 5.75 * 3600_000 - 86_400_000).toISOString().slice(0, 10)
  await page.goto(`/labour/attendance?project=${lakeside}&date=${yesterday}`)
  await expect(page.getByLabel('Yesterday')).toBeVisible()
  await page.getByRole('button', { name: 'Bring a worker from another crew' }).click()
  await page.getByRole('button', { name: /^Ram Bahadur/ }).click()
  const brought = page.locator('section', { has: page.getByRole('heading', { name: 'Brought in for the day' }) })
  await expect(brought.getByRole('button', { name: /^Ram Bahadur/ })).toContainText('Here · 8 h')
  await expect(brought).toContainText('from Site crew')
  await page.getByRole('button', { name: 'Close day' }).click()
  const close2 = page.locator('section', { has: page.getByRole('heading', { name: /^Close yesterday/i }) })
  await close2.getByLabel('Paid now').uncheck()
  await close2.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText(/Day closed: Rs\. 1,200 labour cost for the crew\. Not paid yet/)).toBeVisible()
  await page.screenshot(shots('att-02-brought-in'))

  expect(errors).toEqual([])
})
