import { expect, test, type Page } from '@playwright/test'
import { runId } from './helpers'

// Settings in one column: each card saves on its own; "How you work" saves on tap; VAT choices show
// only with VAT on; the password can be changed while signed in, after the current one is checked.
const run = runId()
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  // A wrong current password is refused by sign-in on purpose (400); anything else is a fault.
  page.on('response', async (r) => {
    if (r.status() >= 400 && !(r.status() === 400 && r.url().includes('/auth/v1/token'))) errors.push(`${r.status()} ${r.url()} ${await r.text().catch(() => '')}`)
  })
  return errors
}

test('settings: one column, each card saves on its own, password change', async ({ page }) => {
  const errors = trackErrors(page)
  const phone = `988${run}`

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Setting Nirman ${run}`)
  await page.getByLabel('Your name').fill('Ram Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 ${phone}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/settings')
  const card = (name: string) => page.locator('section', { has: page.getByRole('heading', { name, exact: true }) })
  // The sign-in number is easy to read.
  await expect(card('My account')).toContainText(`+977 ${phone.slice(0, 3)}-${phone.slice(3)}`)
  // Nothing scrolls sideways on the phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot(shots('settings-01'))

  // VAT treatment shows only while VAT on bills is on; the card saves with its own button.
  const vat = card('Bills and VAT')
  await expect(vat.getByText('Part of project cost')).toBeVisible()
  await vat.getByLabel('VAT on bills').uncheck()
  await expect(vat.getByText('Part of project cost')).toHaveCount(0)
  await vat.getByLabel('Rate difference warning').fill('10')
  await expect(vat.getByText(/a bill above Rs 935 is flagged/)).toBeVisible()
  await vat.getByRole('button', { name: 'Save' }).click()
  await expect(vat.getByText('Saved.')).toBeVisible()

  // Company: name and colour saved together.
  const company = card('Company')
  await company.getByLabel('Company name').fill(`Setting Nirman Pvt ${run}`)
  await company.getByText('Plum').click()
  await company.getByRole('button', { name: 'Save' }).click()
  await expect(company.getByText('Saved.')).toBeVisible()
  await page.reload()
  await expect(card('Company').getByLabel('Company name')).toHaveValue(`Setting Nirman Pvt ${run}`)
  await expect(card('Company').getByRole('radio', { name: 'Plum' })).toBeChecked()
  await expect(card('Bills and VAT').getByLabel('VAT on bills')).not.toBeChecked()
  await expect(card('Bills and VAT').getByLabel('Rate difference warning')).toHaveValue('10')

  // On a wide screen, a short menu sits beside the one column.
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Bills and VAT' })).toBeVisible()
  await page.screenshot({ path: 'e2e/.results/screens/settings-02-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })

  // Change password: the current one is checked first.
  const account = card('My account')
  await account.getByRole('button', { name: 'Change password' }).click()
  await account.getByLabel('Current password').fill('wrong-pass-1')
  await account.getByLabel('New password', { exact: true }).fill('owner-pass-2')
  await account.getByLabel('New password again').fill('owner-pass-2')
  await account.getByRole('button', { name: 'Change password' }).click()
  await expect(account.getByText('The current password is not right.')).toBeVisible()
  await account.getByLabel('Current password').fill('owner-pass-1')
  await account.getByRole('button', { name: 'Change password' }).click()
  await expect(account.getByText(/Password changed/)).toBeVisible()

  // Sign out from settings, and back in with the new password.
  await account.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Mobile number or email').fill(phone)
  await page.getByLabel('Password').fill('owner-pass-2')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  expect(errors).toEqual([])
})
