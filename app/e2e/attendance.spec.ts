import { expect, test, type Page } from '@playwright/test'
import { runId } from './helpers'

// Attendance on a phone (req §14, company setting "Labour by: Attendance"): workers added once with
// a daily or hourly rate and put on the project's Site crew; their days marked on the crew's
// calendar as drafts, then verified into labour owed to each worker; each worker paid on their own;
// a verified, paid day changed afterwards.
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

test('attendance: workers on the crew calendar, the crew today, absent, pay each worker', async ({ page }) => {
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
  // A tap on a box opens the day there; each choice saves as a draft, and the day stays open until
  // Save draft or Verified.
  await todayBox(page, 'Gopal Rai').click()
  await page.getByRole('button', { name: 'Full day' }).click()
  await expect(todayBox(page, 'Gopal Rai')).toHaveAccessibleName(/8 h, draft$/)
  await page.getByRole('button', { name: '+1 hour' }).click()
  await page.screenshot(shots('att-00-day-editor'))
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(todayBox(page, 'Gopal Rai')).toHaveAccessibleName(/9 h, draft$/)

  // The crew today: Mark everyone in gives the rest (Ram) a full day, in one call.
  const today = page.getByRole('region', { name: 'The crew on Today' })
  await expect(today.getByText('1 in · 1 not marked')).toBeVisible()
  await today.getByRole('button', { name: /^Mark everyone in/ }).click()
  await expect(today.getByRole('listitem', { name: 'Ram Bahadur: 8 h, draft' })).toBeVisible()
  // Ram is absent after all: one tap. He is marked, so Mark everyone in has nobody left to mark him in.
  await today.getByRole('group', { name: 'Ram Bahadur on Today' }).getByRole('button', { name: 'Absent' }).click()
  await expect(today.getByRole('listitem', { name: 'Ram Bahadur: Absent, draft' })).toBeVisible()
  await expect(today.getByText('1 in · 1 absent · everyone marked · 2 drafts')).toBeVisible()
  await expect(today.getByRole('button', { name: /^Mark everyone in/ })).toHaveCount(0)
  await workers.getByRole('button', { name: /^Ram Bahadur/ }).click()
  await expect(todayBox(page, 'Ram Bahadur')).toHaveAccessibleName(/absent, draft$/)
  await page.reload()
  await expect(todayBox(page, 'Ram Bahadur')).toHaveAccessibleName(/absent, draft$/)
  // He came at ten after all: a full day.
  await today.getByRole('button', { name: 'Show the crew' }).click()
  await today.getByRole('group', { name: 'Ram Bahadur on Today' }).getByRole('button', { name: 'Full' }).click()
  await expect(todayBox(page, 'Ram Bahadur')).toHaveAccessibleName(/8 h, draft$/)

  // Drafts carry no money: nothing is owed yet.
  const ram = page.locator('section', { has: page.getByRole('heading', { name: 'Summary for Ram Bahadur' }) })
  await expect(ram).toContainText('Owed nowRs. 0')
  await expect(ram).toContainText('1 day is a draft: not counted until verified.')
  await page.screenshot(shots('att-01-crew-board'))

  // Verify the crew's day: both days become labour cost. Ram 1,200 + Gopal 9 h × 150 = 1,350.
  await today.getByRole('button', { name: "Verify the crew's day (2)" }).click()
  await expect(todayBox(page, 'Ram Bahadur')).toHaveAccessibleName(/8 h, verified$/)
  await expect(ram).toContainText('EarnedRs. 1,200')
  await expect(ram).toContainText('Owed nowRs. 1,200')
  await page.screenshot(shots('att-01a-verified'))
  const crewTab = page.getByRole('tab', { name: /^Crew in / })
  const attendanceTab = page.getByRole('tab', { name: 'Attendance' })
  const crew = page.locator('section', { has: page.getByRole('heading', { name: 'Hours and what each is owed' }) })
  await crewTab.click()
  await expect(crew.getByRole('row', { name: /^Total/ })).toContainText('17 h')
  await expect(crew.getByRole('row', { name: /^Total/ })).toContainText('Rs. 2,550')
  await page.screenshot(shots('att-01b-crew-tab'))
  await attendanceTab.click()

  // Pay Gopal: all paying is on the worker's payment form, with his verified day ticked.
  await workers.getByRole('button', { name: /^Gopal Rai/ }).click()
  const gopal = page.locator('section', { has: page.getByRole('heading', { name: 'Summary for Gopal Rai' }) })
  await gopal.getByRole('link', { name: 'Pay Gopal' }).click()
  await expect(page.getByRole('heading', { name: 'Which days does it pay?' })).toBeVisible()
  await expect(page.getByLabel(/^P-1 · /)).toBeChecked()
  await expect(page.getByLabel('Amount paid')).toHaveValue(/1,?350/)
  await page.screenshot(shots('att-02-pay-form'))
  await page.getByRole('button', { name: 'Record payment of Rs. 1,350' }).click()
  await expect(page.getByRole('heading', { name: /^Payment PAY-/ })).toBeVisible()
  await page.goBack()
  await expect(gopal).toContainText('Owed nowRs. 0')

  // Gopal's paid day was 8 h after all: a verified day still changes, and the hour he was paid for
  // is now paid ahead.
  await today.getByRole('button', { name: 'Show the crew' }).click()
  await today.getByRole('group', { name: 'Gopal Rai on Today' }).getByRole('button', { name: 'Full' }).click()
  await expect(todayBox(page, 'Gopal Rai')).toHaveAccessibleName(/8 h, verified$/)
  await expect(gopal).toContainText('Paid aheadRs. 150')

  // A worker's name in the crew's table opens their calendar.
  await crewTab.click()
  await crew.getByRole('button', { name: 'Ram Bahadur' }).click()
  await expect(attendanceTab).toHaveAttribute('aria-selected', 'true')

  // The crew list and the workers list say the same: Ram 1,200, Gopal 150 ahead.
  const crewPage = page.url()
  await page.goto('/crews')
  await expect(page.getByText('Total: Rs. 1,050')).toBeVisible()
  await page.getByRole('link', { name: 'Workers', exact: true }).click()
  await expect(page.getByText('Total: Rs. 1,050')).toBeVisible()
  await page.goto(crewPage)

  // Pay Ram: his day on this project ticked and the amount filled.
  await ram.getByRole('link', { name: 'Pay Ram' }).click()
  await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Which days does it pay?' })).toBeVisible()
  await expect(page.getByLabel(/^P-1 · /)).toBeChecked()
  await expect(page.getByLabel('Amount paid')).toHaveValue(/1,?200/)
  // Ram asks for 2,000: the extra 800 is an advance, on this project.
  await page.getByLabel('Amount paid').fill('2,000')
  await expect(page.getByLabel('Advance of Rs. 800 is on')).toBeVisible()
  await page.getByRole('button', { name: /^Record payment/ }).click()
  await expect(page.getByRole('heading', { name: /^Payment PAY-/ })).toBeVisible()
  // The payment replaced its form in the history, so Back is the crew page again.
  await page.goBack()
  await expect(ram).toContainText('Paid aheadRs. 800')
  await crewTab.click()
  await expect(crew.getByRole('row', { name: /^Total/ })).toContainText('Rs. 950 ahead')
  await attendanceTab.click()
  await page.screenshot(shots('att-03-paid'))

  // Yesterday, Ram worked too. Verifying it takes the 800 off: only 400 of his 1,200 is owed.
  const crewDay = page.getByRole('region', { name: /^The crew on/ })
  await crewDay.getByRole('button', { name: 'Yesterday' }).click()
  await crewDay.getByRole('group', { name: /^Ram Bahadur on / }).getByRole('button', { name: 'Full' }).click()
  await crewDay.getByRole('button', { name: "Verify the crew's day (1)" }).click()
  await expect(ram).toContainText('Owed nowRs. 400')
  await ram.getByRole('link', { name: 'Pay Ram' }).click()
  await expect(page.getByLabel('Amount paid')).toHaveValue('400')
  await page.screenshot(shots('att-03b-pay'))
  await page.getByRole('button', { name: 'Record payment of Rs. 400' }).click()
  await expect(page.getByRole('heading', { name: /^Payment PAY-/ })).toBeVisible()
  await page.goBack()
  await expect(ram).toContainText('Owed nowRs. 0')

  // Ram's own page: no calendar, just the crew to mark him on, and his khata with the day and the payment.
  await page.getByRole('link', { name: 'Khata', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ram Bahadur', level: 1 })).toBeVisible()
  await expect(page.getByRole('group', { name: "Ram Bahadur's days" })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Site crew.*Open calendar$/ })).toBeVisible()
  await expect(page.getByText('Rs. 1,200').first()).toBeVisible()

  expect(errors).toEqual([])
})

// A worker on two projects: a past month marked and verified on the crew calendar, one day shared
// with another project (marked on that project's crew, the afternoon), then paid from each crew.
test('crew calendar: a day on two projects, verified, paid from each crew', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Time Card Nirman ${run}`)
  await page.getByLabel('Your name').fill('Hari Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 985${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()
  const bhandari = await newProject(page, 'P-1', 'Bhandari house')
  const lakeside = await newProject(page, 'P-2', 'Lakeside')
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

  // Last month, so every day is in the past: full days on the 1st and 3rd, the morning of the 2nd.
  await page.getByRole('button', { name: 'Previous month' }).click()
  const days = page.getByRole('group', { name: "Ram Bahadur's days" }).getByRole('button')
  for (const [i, choice, hours] of [[0, 'Full day', /8 h, draft$/], [1, 'Half day', /4 h, draft$/], [2, 'Full day', /8 h, draft$/]] as const) {
    await days.nth(i).click()
    await page.getByRole('button', { name: choice }).click()
    await expect(days.nth(i)).toHaveAccessibleName(hours)
    await page.getByRole('button', { name: 'Verified', exact: true }).click()
    await expect(days.nth(i)).toHaveAccessibleName(/, verified$/)
  }

  // The afternoon of the 2nd at Lakeside: Ram is put on its crew and marked there. The day shows
  // his morning at Bhandari, and Half day takes the afternoon.
  await page.goto(`/labour/attendance?project=${lakeside}`)
  await page.getByRole('button', { name: 'Add worker' }).click()
  await page.locator('section', { has: page.getByRole('heading', { name: 'Add worker' }) }).getByRole('button', { name: /^Ram Bahadur/ }).click()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await days.nth(1).click()
  const day2 = page.getByRole('dialog')
  await expect(day2.getByText('Also that day')).toBeVisible()
  await expect(day2.getByRole('listitem').filter({ hasText: 'P-1 · Bhandari house' })).toContainText('08:00–12:00')
  await day2.getByRole('button', { name: 'Half day' }).click()
  await expect(days.nth(1)).toHaveAccessibleName(/4 h, draft$/)
  await expect(day2.getByLabel('In')).toHaveValue('13:00')
  await page.screenshot(shots('att-04-two-projects'))
  await day2.getByRole('button', { name: 'Save draft' }).click()

  // Ram's page: the three verified Bhandari days are owed; the Lakeside draft is not counted.
  const ramPage = page.getByRole('link', { name: 'Khata', exact: true })
  await ramPage.click()
  const balance = page.locator('section', { has: page.getByRole('heading', { name: 'Balance' }) })
  await expect(balance).toContainText('Rs. 3,000')

  // Verify the Lakeside afternoon: now 3,600.
  await page.goto(`/labour/attendance?project=${lakeside}`)
  await page.getByRole('button', { name: 'Previous month' }).click()
  await days.nth(1).click()
  await page.getByRole('button', { name: 'Verified', exact: true }).click()
  await expect(days.nth(1)).toHaveAccessibleName(/4 h, verified$/)
  await ramPage.click()
  await expect(balance).toContainText('Rs. 3,600')

  // Pay from the Lakeside crew: only Lakeside's day is ticked. Ram takes 1,000: 400 is an advance.
  await page.goto(`/labour/attendance?project=${lakeside}`)
  await page.getByRole('link', { name: 'Pay Ram' }).click()
  await expect(page.getByLabel(/^P-2 · /)).toBeChecked()
  await expect(page.getByLabel(/^P-1 · /)).toHaveCount(3)
  for (const box of await page.getByLabel(/^P-1 · /).all()) await expect(box).not.toBeChecked()
  await expect(page.getByLabel('Amount paid')).toHaveValue('600')
  await page.getByLabel('Amount paid').fill('1,000')
  await page.getByRole('button', { name: 'Record payment of Rs. 1,000' }).click()
  await expect(page.getByRole('heading', { name: /^Payment PAY-/ })).toBeVisible()

  // Then from Bhandari: the Lakeside advance comes off Bhandari's days, 3,000 − 400.
  await page.goto(`/labour/attendance?project=${bhandari}`)
  await page.getByRole('link', { name: 'Pay Ram' }).click()
  await expect(page.getByText('Less advance they already have')).toBeVisible()
  await expect(page.getByLabel('Amount paid')).toHaveValue(/2,?600/)
  await page.getByRole('button', { name: 'Record payment of Rs. 2,600' }).click()
  await expect(page.getByRole('heading', { name: /^Payment PAY-/ })).toBeVisible()
  await page.goto(`/labour/attendance?project=${bhandari}`)
  await ramPage.click()
  await expect(balance).toContainText('Nothing to pay')

  expect(errors).toEqual([])
})
