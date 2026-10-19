import { expect, test, type Page } from '@playwright/test'
import { runId } from './helpers'

// Simple forms (company setting): the same records, with less-used fields folded under "More".
// A fold opens by itself when it holds a value, and Detailed shows every field as before.
const run = runId()
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
  // "How you work" saves each choice as soon as it is tapped.
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'How you work' }) })
  const radio = card.getByRole('radio', { name: style })
  if ((await radio.getAttribute('aria-checked')) === 'true') return
  await radio.click()
  await expect(card.getByText('Saved.')).toBeVisible()
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

  // With nothing waiting, Bills opens on All; an empty tab says how things get there.
  await page.goto('/bills')
  await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: /^To post/ }).click()
  await expect(page.getByText(/sent with "Send to Accounts" wait here/)).toBeVisible()
  await page.goto('/slips')
  await expect(page.getByText(/until everything ordered has arrived/)).toBeVisible()

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
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Thapa house' })).toBeVisible()
  const projectUrl = page.url()

  // No dates yet, so the fold starts closed; the to-do link to a date opens it and focuses the field.
  await page.goto(`${projectUrl}?tab=details&edit=planned_end`)
  await expect(page.locator('#planned_end')).toBeVisible()
  await expect(page.locator('#planned_end')).toBeFocused()
  await page.locator('#planned_start').click()
  await page.getByRole('dialog', { name: 'Choose date' }).getByRole('button', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  // Editing again: the fold opens by itself because it now holds a planned start.
  await page.goto(`${projectUrl}?tab=details`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.locator('#planned_start')).toBeVisible()

  await page.goto('/suppliers')
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByLabel('Business name').fill('Pokhara Cement Traders')
  await page.getByLabel('Materials supplied').fill('Cement')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /Pokhara Cement Traders/ })).toBeVisible()
  // The payment form caches a short supplier list; the supplier page opened after it must still
  // load its full row (it once read the short one and crashed on its categories).
  await page.goto('/payments/new')
  await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Suppliers' }).click()
  // Nothing recorded with them yet, so they are not on the Working on project's list.
  await page.getByRole('group', { name: 'Projects shown' }).getByRole('button', { name: 'All projects' }).click()
  await page.getByRole('link', { name: /Pokhara Cement Traders/ }).click()
  await expect(page.getByRole('heading', { name: 'Pokhara Cement Traders' })).toBeVisible()

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
  // The heading says what is in the fold once something is entered.
  const problem = page.getByText('Problem with this item?')
  await problem.click()
  await page.getByLabel('Rejected').fill('3')
  await problem.click()
  await expect(page.getByText('(3 rejected)')).toBeVisible()

  // Expense: the heading the form picks itself is shown in the summary.
  await page.goto('/expenses/new')
  await expect(page.getByLabel('Cost heading')).toBeHidden()
  await expect(page.getByLabel('Bill number')).toBeHidden()
  // The heading the form fills in itself is named in the summary.
  await expect(page.getByText(/^More details \(.+\)$/)).toBeVisible()

  // Detailed shows every field again.
  await chooseForms(page, 'Detailed')
  await page.goto('/bills/new')
  await expect(page.getByLabel('VAT')).toBeVisible()
  await expect(page.getByText('Discount, transport, VAT')).toHaveCount(0)
  await page.goto('/projects/new')
  await expect(page.locator('#planned_start')).toBeVisible()

  expect(errors).toEqual([])
})
