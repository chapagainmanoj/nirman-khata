import { expect, test, type Page } from '@playwright/test'
import { runId } from './helpers'

// Attendance on a phone (req §14, company setting "Labour by: Attendance"): workers added once with
// a daily or hourly rate and put on the project's Site crew; their days marked on the crew's
// calendar; the month closed into labour owed to each worker; then one worker paid on their own.
// The crew page is the one place days are marked; a worker's own page is their crews and khata.
const run = runId()
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

/** A box of a worker's month on the crew calendar: today's. */
const todayBox = (page: Page, name: string) => page.getByRole('group', { name: `${name}'s days` }).locator('[aria-current="date"]')

async function addWorkerForm(page: Page, name: string, by: 'Day' | 'Hour', rate: string) {
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('radio', { name: by }).click()
  await page.getByLabel(by === 'Day' ? 'Rate for a full day' : 'Rate for an hour').fill(rate)
  await page.getByRole('button', { name: 'Add worker' }).last().click()
}

async function addWorker(page: Page, name: string, by: 'Day' | 'Hour', rate: string) {
  await page.getByRole('button', { name: 'Add worker' }).click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('radio', { name: by }).click()
  await page.getByLabel(by === 'Day' ? 'Rate for a full day' : 'Rate for an hour').fill(rate)
  await page.getByRole('button', { name: 'Add worker' }).last().click()
  await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
}

test('attendance: workers on the crew calendar, close the month, pay one worker', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Hajiri Nirman ${run}`)
  await page.getByLabel('Your name').fill('Gita Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 984${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()
  await newProject(page, 'P-1', 'Bhandari house')

  // Settings: labour by attendance, under "Track own labour".
  await page.goto('/settings')
  const work = page.locator('section', { has: page.getByRole('heading', { name: 'How you work' }) })
  await work.getByRole('radio', { name: 'Attendance' }).click()
  await expect(work.getByText('Saved.')).toBeVisible()
  await expect(work.getByLabel('Paid hours')).toHaveValue('480')
  await page.reload()

  // Workers are added once, from Labour crews: a mistri by the day.
  await page.goto('/crews')
  await page.getByRole('link', { name: 'Workers', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Workers' })).toBeVisible()
  await page.getByRole('button', { name: 'Add worker' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Ram Bahadur')
  await page.getByLabel('Rate for a full day').fill('1,200')
  await page.getByRole('button', { name: 'Add worker' }).last().click()
  await expect(page.getByRole('link', { name: /Ram Bahadur/ })).toBeVisible()

  // "+" Attendance opens the project's crew: Ram is put on it, Gopal is new, paid by the hour.
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.getByRole('dialog', { name: 'Record' }).getByRole('link', { name: /Attendance/ }).click()
  await expect(page.getByRole('heading', { name: 'Site crew' })).toBeVisible()
  await page.getByRole('button', { name: 'Add worker' }).click()
  const adding = page.locator('section', { has: page.getByRole('heading', { name: 'Add worker' }) })
  await adding.getByRole('button', { name: /^Ram Bahadur/ }).click()
  // Nobody else in the company yet, so the form for a new worker opens at once.
  await page.getByRole('button', { name: 'Add worker' }).click()
  await addWorkerForm(page, 'Gopal Rai', 'Hour', '150')
  const workers = page.getByRole('navigation', { name: 'Workers' })
  await expect(workers.getByRole('button', { name: /^Gopal Rai/ })).toHaveAttribute('aria-current', 'true')

  // Gopal today: a full day and an hour more. Then Ram: a full day.
  // A tap on a box opens the day there; a quick choice saves and closes it.
  await todayBox(page, 'Gopal Rai').click()
  await page.getByRole('button', { name: 'Full day' }).click()
  await expect(todayBox(page, 'Gopal Rai')).toHaveAccessibleName(/8 h$/)
  await todayBox(page, 'Gopal Rai').click()
  await page.getByRole('button', { name: '+1 hour' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(todayBox(page, 'Gopal Rai')).toHaveAccessibleName(/9 h$/)
  // Everyone in: the rest of the crew (Ram) gets a full day today.
  await page.getByRole('button', { name: /^Everyone in/ }).click()
  await expect(page.getByText(/^1 worker marked in for/)).toBeVisible()
  await workers.getByRole('button', { name: /^Ram Bahadur/ }).click()
  await expect(todayBox(page, 'Ram Bahadur')).toHaveAccessibleName(/8 h$/)
  await expect(page.getByRole('button', { name: /^Everyone in/ })).toBeDisabled()

  // Under the calendar: Ram's month. Below: the crew, Ram 1,200 + Gopal 9 h × 150 = 1,350.
  const ram = page.locator('section', { has: page.getByRole('heading', { name: /for Ram Bahadur$/ }) })
  await expect(ram).toContainText('Earned this monthRs. 1,200')
  await expect(ram).toContainText('Still to pay on this projectRs. 1,200')
  const crew = page.locator('section', { has: page.getByRole('heading', { name: 'Crew this month' }) })
  await expect(crew.getByRole('row', { name: /^Total/ })).toContainText('17 h')
  await expect(crew.getByRole('row', { name: /^Total/ })).toContainText('Rs. 2,550')
  await page.screenshot(shots('att-01-crew-board'))

  // Close the month's open days, not paid yet: each worker is owed their own days.
  await crew.getByRole('button', { name: 'Close days' }).click()
  await crew.getByRole('button', { name: 'Close 1 day' }).click()
  await expect(page.getByText(/Closed 1 day: Rs\. 2,550 labour cost, owed to each worker\. Not paid yet/)).toBeVisible()
  await expect(todayBox(page, 'Ram Bahadur')).toHaveAccessibleName(/closed$/)

  // Pay Ram on his own.
  await ram.getByRole('button', { name: 'Pay Ram' }).click()
  await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible()
  await expect(page.getByText('Unpaid: Rs. 1,200')).toBeVisible()
  await page.getByLabel(/^Labour: Jyami · P-1/).check()
  await expect(page.getByLabel('Amount paid')).toHaveValue(/1,?200/)
  await page.getByRole('button', { name: /^Record payment/ }).click()
  await expect(page.getByRole('heading', { name: /^Payment PAY-/ })).toBeVisible()
  // The payment replaced its form in the history, so Back is the crew page again.
  await page.goBack()
  await expect(ram).toContainText('Still to pay on this projectRs. 0')
  await expect(crew.getByRole('row', { name: /^Total/ })).toContainText('Rs. 1,350')
  await page.screenshot(shots('att-02-paid'))

  // Ram's own page: no calendar, just the crew to mark him on, and his khata with the day and the payment.
  await page.getByRole('link', { name: 'Khata', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ram Bahadur', level: 1 })).toBeVisible()
  await expect(page.getByRole('group', { name: "Ram Bahadur's days" })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Site crew.*Open calendar$/ })).toBeVisible()
  await expect(page.getByText('Rs. 1,200').first()).toBeVisible()

  expect(errors).toEqual([])
})

// A worker on two projects: a past month marked on the crew calendar, one day split with another
// project there, then the crew's days closed.
test('crew calendar: split a day with another project, then close the crew\'s days', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Time Card Nirman ${run}`)
  await page.getByLabel('Your name').fill('Hari Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 985${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()
  const bhandari = await newProject(page, 'P-1', 'Bhandari house')
  await newProject(page, 'P-2', 'Lakeside')
  await page.goto('/settings')
  const work = page.locator('section', { has: page.getByRole('heading', { name: 'How you work' }) })
  await work.getByRole('radio', { name: 'Attendance' }).click()
  await expect(work.getByText('Saved.')).toBeVisible()
  await page.reload()

  // The old roster address opens the project's crew page.
  await page.goto(`/labour/attendance?project=${bhandari}`)
  await expect(page.getByRole('heading', { name: 'Site crew' })).toBeVisible()
  await page.getByRole('button', { name: 'Add worker' }).click()
  await addWorkerForm(page, 'Ram Bahadur', 'Day', '1,200')

  // Last month, so every day is in the past: a full day on each of the first three.
  await page.getByRole('button', { name: 'Previous month' }).click()
  const days = page.getByRole('group', { name: "Ram Bahadur's days" }).getByRole('button')
  for (const i of [0, 1, 2]) {
    await days.nth(i).click()
    await page.getByRole('button', { name: 'Full day' }).click()
    await expect(days.nth(i)).toHaveAccessibleName(/8 h$/)
  }

  // Day 2: the afternoon at Lakeside. Bhandari keeps the morning.
  await days.nth(1).click()
  const day2 = page.getByRole('dialog')
  await day2.getByRole('button', { name: 'Split with another project' }).click()
  await day2.getByLabel('Other project for the rest of the day').selectOption({ label: 'P-2 · Lakeside' })
  await expect(day2.getByText('Also that day')).toBeVisible()
  await expect(day2.getByRole('listitem').filter({ hasText: 'P-2 · Lakeside' })).toContainText('13:00–17:00')
  await page.screenshot(shots('att-03-split'))
  await day2.getByRole('button', { name: 'Done' }).click()
  await expect(days.nth(1)).toHaveAccessibleName(/4 h$/)

  // Close the crew's days: Bhandari's three, owed to Ram; Lakeside's afternoon stays open.
  const crew = page.locator('section', { has: page.getByRole('heading', { name: 'Crew this month' }) })
  await crew.getByRole('button', { name: 'Close days' }).click()
  await crew.getByRole('button', { name: 'Close 3 days' }).click()
  await expect(page.getByText(/Closed 3 days: Rs\. 3,000 labour cost, owed to each worker\. Not paid yet/)).toBeVisible()
  await expect(page.getByRole('button', { name: /, closed$/ })).toHaveCount(3)

  expect(errors).toEqual([])
})
