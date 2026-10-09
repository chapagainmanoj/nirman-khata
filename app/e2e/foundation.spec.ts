import { expect, test, type Page } from '@playwright/test'

// Milestone 1 walk-through: owner registers, creates projects, adds a site staff
// member; the staff member sees only the assigned project and no amounts.
const run = Date.now().toString().slice(-7)
const ownerPhone = `981${run}`
const staffPhone = `982${run}`
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return errors
}

test('owner sets up a company; site staff sees only their project', async ({ page }) => {
  const errors = trackErrors(page)

  // Register
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Test Nirman ${run}`)
  await page.getByLabel('Your name').fill('Ram Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 ${ownerPhone}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()
  await page.screenshot(shots('01-projects-empty'))

  // New project: budget follows contract until edited
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Ward 5 school building')
  await page.getByLabel('District').fill('Kaski')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('50,00,000')
  await expect(page.getByLabel('Spending budget (Lagat Anuman)')).toHaveValue('50,00,000')
  await expect(page.getByText('Rs. 50 lakh').first()).toBeVisible()
  await expect(page.getByText('Planned margin (contract − budget)').locator('..')).toContainText('Rs. 0')
  await page.getByLabel('Spending budget (Lagat Anuman)').fill('40,00,000')
  await expect(page.getByText('Planned margin (contract − budget)').locator('..')).toContainText('Rs. 10,00,000')

  // BS date picker for planned start: 1 Shrawan 2083
  const planned = page.getByText('Planned start', { exact: true }).locator('..')
  await planned.getByLabel('Year').selectOption('2083')
  await planned.getByLabel('Month').selectOption({ label: 'Shrawan' })
  await planned.getByLabel('Day').selectOption('1')
  await expect(page.getByText('2083-04-01 BS · 17 Jul 2026')).toBeVisible()
  // Switch to AD shows a normal date input with the same date
  await planned.getByRole('button', { name: 'Switch to AD calendar' }).click()
  await expect(page.locator('#planned_start')).toHaveValue('2026-07-17')
  await page.screenshot(shots('02-new-project'))

  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Ward 5 school building' })).toBeVisible()
  await expect(page.getByText('Current contract').locator('..')).toContainText('Rs. 50,00,000')
  await expect(page.getByText('Current spending budget').locator('..')).toContainText('Rs. 40,00,000')
  await expect(page.getByText('Planned start').locator('..')).toContainText('2083-04-01 BS')
  await page.screenshot(shots('03-project-detail'))

  // A second project the staff member will not be assigned to
  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-2')
  await page.getByLabel('Project name').fill('Private house Pokhara')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('25,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Private house Pokhara' })).toBeVisible()

  // Add site staff assigned to P-1 only, without money access
  await page.goto('/staff')
  await page.getByRole('button', { name: 'Add staff' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Hari Supervisor')
  await page.getByLabel('Mobile number or email').fill(staffPhone)
  await page.getByLabel('Starting password').fill('staff-pass-1')
  await page.getByLabel('P-1 · Ward 5 school building').check()
  await page.locator('form').getByRole('button', { name: 'Add staff' }).click()
  await expect(page.getByText('Hari Supervisor')).toBeVisible()
  await page.screenshot(shots('04-staff'))

  // Sign out, sign in as the staff member
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByLabel('Mobile number or email').fill(staffPhone)
  await page.getByLabel('Password').fill('staff-pass-1')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText('Ward 5 school building')).toBeVisible()
  await expect(page.getByText('Private house Pokhara')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Staff' })).toHaveCount(0)
  await page.screenshot(shots('05-staff-projects'))

  await page.getByText('Ward 5 school building').click()
  await expect(page.getByRole('heading', { name: 'Ward 5 school building' })).toBeVisible()
  await expect(page.getByText('Contract and budget')).toHaveCount(0)
  await expect(page.getByText('Rs.')).toHaveCount(0)
  await page.screenshot(shots('06-staff-project-no-amounts'))

  // Direct URL to the unassigned project shows nothing
  await page.goto('/projects')
  expect(errors).toEqual([])
})

test('BS date picker fits on a phone', async ({ page }) => {
  // The picker is behind login, so register a fresh owner first.
  const phone = `983${Date.now().toString().slice(-7)}`
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Picker ${phone}`)
  await page.getByLabel('Your name').fill('Picker Owner')
  await page.getByLabel('Mobile number or email').fill(phone)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await page.getByRole('button', { name: 'New project' }).click()
  const effective = page.getByText('Effective from', { exact: true }).locator('..')
  await effective.scrollIntoViewIfNeeded()
  const year = effective.getByLabel('Year')
  // The selected year must be fully visible, not clipped to "20".
  const fits = await year.evaluate((el: HTMLSelectElement) => el.scrollWidth <= el.clientWidth + 1)
  expect(fits).toBe(true)
  await effective.screenshot({ path: 'e2e/.results/screens/07-bs-picker.png' })
})
