import { expect, test, type Page } from '@playwright/test'

// Money in from the client: record Rs 1,00,000 from the project's Client tab, see it as Received and
// Contract balance against the contract (never as cost or paid), then reverse it and the totals go back.
const run = Date.now().toString().slice(-7)
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  page.on('response', async (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()} ${await r.text().catch(() => '')}`) })
  return errors
}

const row = (scope: ReturnType<Page['locator']>, label: string) => scope.getByText(label, { exact: true }).locator('..')

test('a client payment counts toward the contract, not costs, and can be reversed', async ({ page }) => {
  const errors = trackErrors(page)

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Grahak Nirman ${run}`)
  await page.getByLabel('Your name').fill('Hari Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 986${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Karki house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('20,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Karki house' })).toBeVisible()
  const projectUrl = page.url()

  // The Client tab starts empty and leads to the form for this project.
  await page.getByRole('tab', { name: 'Client' }).click()
  await expect(page.getByText('No payments from the client recorded yet.')).toBeVisible()
  await page.getByRole('link', { name: 'Record payment received' }).click()
  await expect(page.getByRole('combobox', { name: 'Project' }).locator('option:checked')).toHaveText('P-1 · Karki house')
  await page.getByLabel('Amount').fill('1,00,000')
  await page.getByLabel('How').selectOption({ label: 'Cheque' })
  await page.getByLabel('Reference').fill('CHQ-881')
  await page.screenshot(shots('cr-01-form'))
  await page.getByRole('button', { name: 'Save payment' }).click()
  await expect(page.getByRole('heading', { name: 'Client payment CR-0001' })).toBeVisible()
  await expect(page.getByText('Rs. 1,00,000').first()).toBeVisible()

  // Against the contract on the Client tab and in the Contract and budget card.
  await page.goto(`${projectUrl}?tab=client`)
  const client = page.locator('main')
  await expect(row(client, 'Received from client')).toContainText('Rs. 1,00,000')
  await expect(row(client, 'Contract balance')).toContainText('Rs. 19,00,000')
  await expect(client.getByRole('link', { name: /CR-0001/ })).toContainText('Rs. 1,00,000')
  await page.screenshot(shots('cr-02-client-tab'))

  await page.goto(projectUrl)
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Contract and budget' }) })
  await expect(row(card, 'Received')).toContainText('Rs. 1,00,000')
  await expect(row(card, 'Contract balance')).toContainText('Rs. 19,00,000')
  // Not a cost and not money paid out.
  await expect(row(card, 'Spent')).toContainText('Rs. 0')
  await expect(row(card, 'Paid')).toContainText('Rs. 0')
  const activity = page.locator('section', { has: page.getByRole('heading', { name: 'Activity' }) })
  await expect(activity.getByRole('link', { name: /Received CR-0001/ })).toContainText('Rs. 1,00,000')
  await page.screenshot(shots('cr-03-overview'))

  // Money received is on the project page; the dashboard keeps to spending and what is owed.
  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: /^To pay/ })).toBeVisible()
  await page.goto(projectUrl)

  // A bounced cheque: reverse it with a reason; the totals go back.
  await activity.getByRole('link', { name: /Received CR-0001/ }).click()
  await page.getByRole('button', { name: 'Reverse payment' }).click()
  await page.getByLabel('Reason').fill('Cheque bounced')
  await page.getByRole('button', { name: 'Reverse payment' }).last().click()
  await expect(page.getByText('Reversed', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Cheque bounced/)).toBeVisible()

  await page.goto(projectUrl)
  await expect(row(card, 'Received')).toContainText('Rs. 0')
  await expect(row(card, 'Contract balance')).toContainText('Rs. 20,00,000')

  expect(errors).toEqual([])
})
