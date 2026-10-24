import { expect, test, type Locator } from '@playwright/test'
import { runId } from './helpers'

// An Admin deletes entries made by mistake that were never used (product owner, 2026-10-24);
// the refusal for used ones is tested in supabase/tests/045_delete_unused.sql. Also: the dashboard's
// big figures stay in their own columns with crores in them, on a phone and on a wide screen.
const run = runId()

/** The text fits its own box: an amount that spills out runs into the column beside it. */
async function fits(amount: Locator) {
  await expect(amount).toBeVisible()
  expect(await amount.evaluate((el) => el.scrollWidth <= el.clientWidth), `${await amount.textContent()} spills out of its column`).toBe(true)
}

test('delete a never-used subcontractor and project; crores fit on the dashboard', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Delete Nirman ${run}`)
  await page.getByLabel('Your name').fill('Ram Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 987${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('T-1')
  await page.getByLabel('Project name').fill('Typo project')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('6,33,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Typo project' })).toBeVisible()

  // Dashboard: each big figure, crores too, fits its column instead of running into the next.
  for (const width of [393, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const block = page.getByRole('region', { name: 'Running projects' })
    await fits(block.getByRole('link', { name: /^Spent so far/ }).getByText(/^Rs\./).first())
    await fits(block.getByRole('link', { name: /^Left to spend/ }).getByText('Rs. 6,33,00,000', { exact: true }).first())
    await fits(block.getByRole('link', { name: /^To pay/ }).getByText(/^Rs\./).first())
  }
  await page.setViewportSize({ width: 393, height: 851 })

  // A subcontractor added by mistake: deleted from its edit page.
  await page.goto('/subcontractors')
  await page.getByRole('button', { name: /^Add / }).click()
  await page.getByLabel('Name', { exact: true }).fill('Typo Plaster')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link', { name: /Typo Plaster/ }).click()
  await page.goto(`${new URL(page.url()).pathname.replace(/\/$/, '')}/edit`)
  await page.getByRole('button', { name: 'Delete Typo Plaster' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page).toHaveURL(/\/subcontractors$/)
  await expect(page.getByRole('link', { name: /Typo Plaster/ })).toHaveCount(0)

  // The project, never used: deleted with its budget and crew.
  await page.goto('/projects')
  await page.getByRole('link', { name: /Typo project/ }).click()
  await page.getByRole('tab', { name: 'Project details' }).click()
  await page.getByRole('button', { name: 'Edit' }).first().click()
  await page.getByRole('button', { name: 'Delete Typo project' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('link', { name: /Typo project/ })).toHaveCount(0)
})
