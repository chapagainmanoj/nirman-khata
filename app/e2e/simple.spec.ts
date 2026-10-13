import { expect, test, type Page } from '@playwright/test'

// Simple forms (company setting): the same records, with less-used fields folded under "More".
// A fold opens by itself when it holds a value, and Detailed shows every field as before.
const run = Date.now().toString().slice(-7)
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  page.on('response', async (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()} ${await r.text().catch(() => '')}`) })
  return errors
}

async function chooseForms(page: Page, style: 'Simple' | 'Detailed') {
  await page.goto('/settings')
  const form = page.locator('form', { has: page.getByRole('radiogroup', { name: 'How forms look' }) })
  await form.getByRole('radio', { name: style }).click()
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form.getByText('Saved.')).toBeVisible()
}

test('simple forms fold the less-used fields; values and detailed mode keep them open', async ({ page }) => {
  const errors = trackErrors(page)

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Sajilo Nirman ${run}`)
  await page.getByLabel('Your name').fill('Sita Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 988${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()
  await chooseForms(page, 'Simple')

  // New project: code, name, client and amounts in view; location and dates folded.
  await page.goto('/projects/new')
  await expect(page.getByLabel('Client name')).toBeVisible()
  await expect(page.locator('#planned_start')).toBeHidden()
  await page.screenshot(shots('simple-01-project'))
  await page.getByText('Client phone, location, manager, dates').click()
  await expect(page.locator('#planned_start')).toBeVisible()
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Thapa house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('20,00,000')
  await page.locator('#planned_start').click()
  await page.getByRole('dialog', { name: 'Choose date' }).getByRole('button', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Thapa house' })).toBeVisible()
  const projectUrl = page.url()

  // Editing: the fold opens by itself because it holds a planned start.
  await page.getByRole('tab', { name: 'Details' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.locator('#planned_start')).toBeVisible()
  // The to-do link to a date opens the fold and focuses the field.
  await page.goto(`${projectUrl}?tab=details&edit=planned_end`)
  await expect(page.locator('#planned_end')).toBeVisible()
  await expect(page.locator('#planned_end')).toBeFocused()

  await page.goto('/suppliers')
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByLabel('Business name').fill('Pokhara Cement Traders')
  await page.getByLabel('Materials supplied').fill('Cement')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /Pokhara Cement Traders/ })).toBeVisible()

  // Bill: the charges fold away with a short summary; the total stays in view.
  await page.goto('/bills/new')
  const charges = page.getByText('Discount, transport, VAT')
  await expect(charges).toBeVisible()
  await expect(page.getByText('(none)')).toBeVisible()
  await expect(page.getByLabel('VAT')).toBeHidden()
  await expect(page.getByText(/^Total Rs\./)).toBeVisible()
  await expect(page.getByLabel('Notes')).toBeVisible()
  await page.screenshot(shots('simple-02-bill'))
  await charges.click()
  await expect(page.getByLabel('VAT')).toBeVisible()
  await page.getByLabel('VAT').fill('1,300')
  await charges.click()
  await expect(page.getByText('(VAT Rs. 1,300)')).toBeVisible()

  // Delivery: the problem fields fold per item.
  await page.goto('/deliveries/new')
  await expect(page.getByText('Problem with this item?')).toBeVisible()
  await expect(page.getByLabel('Rejected')).toBeHidden()
  await expect(page.getByLabel('Note', { exact: true })).toBeVisible()

  // Expense: the heading the form picks itself is shown in the summary.
  await page.goto('/expenses/new')
  await expect(page.getByLabel('Cost heading')).toBeHidden()
  await expect(page.getByLabel('Bill number')).toBeHidden()
  await expect(page.getByText('More details')).toBeVisible()

  // Detailed shows every field again.
  await chooseForms(page, 'Detailed')
  await page.goto('/bills/new')
  await expect(page.getByLabel('VAT')).toBeVisible()
  await expect(page.getByText('Discount, transport, VAT')).toHaveCount(0)
  await page.goto('/projects/new')
  await expect(page.locator('#planned_start')).toBeVisible()

  expect(errors).toEqual([])
})
