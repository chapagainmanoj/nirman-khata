import { expect, test, type Page } from '@playwright/test'
import { runId } from './helpers'

// A subcontractor paid directly for work done (GLOSSARY: Direct Payment), on a phone: the work is
// added from the payment form, peski is given first as an advance, then a payment for work done
// uses the peski and pays the rest in cash. The work is the project cost, not the cash.
const run = runId()
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })
const row = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')

test('a subcontractor paid directly: advance, then work done paid from it and cash', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Sidha Nirman ${run}`)
  await page.getByLabel('Your name').fill('Hari Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 986${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Rai house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('20,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Rai house' })).toBeVisible()
  const projectUrl = page.url()

  // A new subcontractor is paid directly unless chosen otherwise; they stay listed once added.
  await page.goto('/subcontractors')
  await page.getByRole('button', { name: 'Add subcontractor' }).click()
  await page.getByLabel('Name').fill('Rai Plaster')
  await expect(page.getByLabel(/Directly for work done/)).toBeChecked()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link', { name: /Rai Plaster/ }).click()

  // Peski before the work: the work is added from the payment form.
  await page.getByRole('link', { name: 'Record payment' }).click()
  const work = page.locator('section', { has: page.getByRole('heading', { name: 'Which work package is it for?' }) })
  await expect(work).toContainText('No work package for them yet')
  await work.getByRole('button', { name: '+ New work package' }).click()
  await work.getByLabel('What work').fill('Plaster, ground floor')
  await expect(work.getByLabel('Project', { exact: true })).not.toHaveValue('')
  await work.getByRole('button', { name: 'Add work package' }).click()
  await expect(work.getByRole('radio', { name: /Plaster, ground floor/ })).toBeChecked()
  await work.getByLabel(/This is an advance/).check()
  await page.getByLabel('Amount paid').fill('20,000')
  await page.screenshot(shots('direct-01-advance'))
  await page.getByRole('button', { name: /Record payment of Rs\. 20,000/ }).click()
  await expect(page.getByRole('heading', { name: /PAY-0001/ })).toBeVisible()

  // Work done, Rs. 50,000: the peski pays 20,000 of it and 30,000 is cash.
  await page.goto('/subcontractors')
  await page.getByRole('link', { name: /Rai Plaster/ }).click()
  await page.getByRole('link', { name: 'Record payment' }).click()
  await expect(work.getByRole('radio', { name: /Plaster, ground floor/ })).toBeChecked()
  await expect(work.getByLabel(/This is an advance/)).not.toBeChecked()
  await page.getByLabel('Amount for the work').fill('50,000')
  await expect(work).toContainText('− Rs. 20,000')
  await expect(row(page, 'To pay in cash')).toContainText('Rs. 30,000')
  await page.screenshot(shots('direct-02-work-done'))
  await page.getByRole('button', { name: /Record payment of Rs\. 30,000/ }).click()
  await expect(page.getByRole('heading', { name: /PAY-0002/ })).toBeVisible()

  // The project cost is the work; the work page shows it paid, with Pay for work as its main action.
  await page.goto(projectUrl)
  await expect(row(page, 'Cost so far')).toContainText('Rs. 50,000')
  await page.goto('/subcontractors')
  await page.getByRole('link', { name: /Rai Plaster/ }).click()
  await page.getByRole('link', { name: /Plaster, ground floor/ }).click()
  await expect(page.getByRole('link', { name: 'Pay for work' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Work done' })).toBeVisible()
  await expect(row(page, 'Paid').first()).toContainText('Rs. 50,000')

  expect(errors).toEqual([])
})
