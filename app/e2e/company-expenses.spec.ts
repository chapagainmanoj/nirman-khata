import { expect, test, type Page } from '@playwright/test'
import { runId } from './helpers'

// Other expenses on a phone (req §15): khaja paid in cash with no name goes to the project; a
// sabal for the company is a record only, kept out of project cost; both show under Money's
// Other expenses, and a company expense can be reversed.
const run = runId()
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  page.on('response', async (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()} ${await r.text().catch(() => '')}`)
  })
  return errors
}

test('project cash without a name, and a company expense kept as a record', async ({ page }) => {
  const errors = trackErrors(page)

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Kharcha Nirman ${run}`)
  await page.getByLabel('Your name').fill('Hari Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 987${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Rai house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('10,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Rai house' })).toBeVisible()
  const projectUrl = page.url()

  // Khaja paid in cash on the spot: no name needed.
  await page.goto('/expenses')
  await expect(page.getByRole('heading', { name: 'Other expenses' })).toBeVisible()
  await page.getByRole('link', { name: 'Enter other expense' }).click()
  await expect(page.getByRole('radio', { name: 'A project' })).toBeChecked()
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue(/.+/) // the only project
  await page.getByLabel('Amount').fill('1,800')
  await page.getByLabel('What for').fill('Khaja for crew')
  await expect(page.getByLabel('Paid now')).toBeChecked()
  await expect(page.getByText('Optional when paid now; leave empty for cash.')).toBeVisible()
  await page.getByRole('button', { name: 'Save other expense' }).click()
  await expect(page.getByRole('heading', { name: 'Other expense saved' })).toBeVisible()
  await expect(page.getByText(/Paid now \(PAY-0001\)/)).toBeVisible()

  // A sabal for the company: chosen explicitly, a record only.
  await page.goto('/expenses')
  await page.getByRole('tab', { name: 'Company' }).click()
  await expect(page.getByText('No company expenses yet.')).toBeVisible()
  await page.getByRole('link', { name: 'Enter other expense' }).click()
  await expect(page.getByRole('radio', { name: 'Company' })).toBeChecked()
  await expect(page.getByLabel('Project', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Paid to')).toHaveCount(0)
  await page.getByLabel('Amount').fill('3,400')
  await page.getByLabel('What for').fill('Sabal x2')
  await page.getByLabel('How it was paid').selectOption({ label: 'Cash' })
  await page.screenshot(shots('ce-01-company-expense'))
  await page.getByRole('button', { name: 'Save company expense' }).click()
  await expect(page.getByRole('heading', { name: 'Company expense saved' })).toBeVisible()
  await expect(page.getByText(/Kept as a company record; it is not a project cost\./)).toBeVisible()

  // The list: each tab holds its own kind.
  await page.goto('/expenses')
  await expect(page.getByText('Khaja for crew')).toBeVisible()
  await expect(page.getByText('Sabal x2')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Company' }).click()
  const sabal = page.getByRole('row').filter({ hasText: 'Sabal x2' })
  await expect(sabal).toContainText('Paid: Cash')
  await expect(sabal).toContainText('Rs. 3,400')
  await page.screenshot(shots('ce-02-company-tab'))

  // One cost, one cash-out: each names the other.
  const paidKhaja = page.getByRole('row').filter({ hasText: 'Khaja for crew' })
  await page.getByRole('tab', { name: 'On projects' }).click()
  await paidKhaja.getByRole('link', { name: 'PAY-0001' }).click()
  await expect(page).toHaveURL(/\/payments\//)
  await page.goto('/payments')
  await expect(page.getByRole('row').filter({ hasText: 'PAY-0001' })).toContainText('For Khaja for crew')
  await page.screenshot(shots('ce-04-payments-for'))

  // The project counts the khaja under the Cash payee, never the sabal.
  await page.goto(projectUrl)
  await page.getByRole('tab', { name: 'Labour & costs' }).click()
  const khaja = page.getByRole('row').filter({ hasText: 'Khaja for crew' })
  await expect(khaja.getByRole('link', { name: 'Cash', exact: true })).toBeVisible() // the Cash payee, shortened in the table
  await expect(khaja).toContainText('Paid')
  await expect(page.getByText('Sabal x2')).toHaveCount(0)

  // Other services are not in the nav; Suppliers links to them.
  await page.goto('/suppliers')
  await page.getByRole('link', { name: /Other services/ }).click()
  await expect(page.getByRole('heading', { name: 'Other services' })).toBeVisible()
  await expect(page.getByText('Cash (not named)')).toBeVisible()
  await page.screenshot(shots('ce-03-service-providers'))

  // Entered twice by mistake: Admin reverses it, and it stays in the list, marked.
  await page.goto('/expenses')
  await page.getByRole('tab', { name: 'Company' }).click()
  await sabal.getByRole('button', { name: 'Reverse' }).click()
  await page.getByLabel('Reason').fill('Entered twice')
  await page.getByRole('button', { name: 'Reverse', exact: true }).last().click()
  await expect(sabal).toContainText('Reversed')

  expect(errors).toEqual([])
})
