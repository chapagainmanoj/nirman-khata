import { expect, test, type Page } from '@playwright/test'

// Milestone 2 walk-through on a phone: supplier -> slip -> approval -> partial delivery ->
// bill from the delivery -> post -> payment -> project cost and supplier khata.
const run = Date.now().toString().slice(-7)
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return errors
}

const row = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')

test('order, receive, bill, pay: cost and balance add up', async ({ page }) => {
  const errors = trackErrors(page)

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Supply Nirman ${run}`)
  await page.getByLabel('Your name').fill('Ram Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 983${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Ward 5 school building')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('10,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Ward 5 school building' })).toBeVisible()

  // Supplier
  await page.getByRole('navigation').getByRole('link', { name: 'Suppliers' }).last().click()
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByLabel('Business name').fill('Shrestha Suppliers')
  await page.getByLabel('Materials supplied').fill('Cement, Rod')
  await page.getByLabel('Phone').fill('9856000001')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /Shrestha Suppliers/ })).toBeVisible()
  await page.screenshot(shots('m2-01-suppliers'))

  // Slip: 100 bags of cement, submitted and approved
  await page.goto('/slips/new')
  await page.getByLabel('Supplier').selectOption({ label: 'Shrestha Suppliers (Cement, Rod)' })
  await page.getByLabel('Material', { exact: true }).selectOption({ label: 'Cement' })
  await expect(page.getByLabel('Unit', { exact: true })).toHaveValue(/.+/)
  await page.getByLabel('Quantity').fill('100')
  await page.screenshot(shots('m2-02-new-slip'))
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText('Pending approval')).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Approved', { exact: true })).toBeVisible()
  await expect(page.getByText('Not sent')).toBeVisible()
  await page.screenshot(shots('m2-03-slip-approved'))

  // Delivery: 60 of 100 arrive
  await page.getByRole('link', { name: 'Record delivery' }).click()
  await expect(page.getByLabel(/^Received/)).toHaveValue('100')
  await page.getByLabel(/^Received/).fill('60')
  await page.getByLabel('Challan number').fill('CH-501')
  // The phone reloads mid-entry: the challan is still there.
  await page.waitForTimeout(800)
  await page.reload()
  await expect(page.getByText('Restored your unsaved delivery.')).toBeVisible()
  await expect(page.getByLabel('Challan number')).toHaveValue('CH-501')
  await expect(page.getByLabel(/^Received/)).toHaveValue('60')
  await page.getByRole('button', { name: 'Save delivery' }).click()
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to slip' }).click()
  await expect(page.getByText('Received 60 · Pending 40')).toBeVisible()
  await expect(page.getByText('Partly received')).toBeVisible()
  await page.screenshot(shots('m2-04-slip-partly-received'))

  // Bill from the unbilled delivery; only the rate is typed
  await page.goto('/suppliers')
  await page.getByRole('link', { name: /Shrestha Suppliers/ }).click()
  await page.getByRole('link', { name: 'Enter bill' }).click()
  await page.getByLabel('Bill number').fill('1001')
  await page.getByRole('button', { name: 'Add them as lines' }).click()
  await expect(page.getByLabel('Quantity')).toHaveValue('60')
  await page.getByLabel('Rate per unit').fill('850')
  await expect(page.getByText('Total Rs. 51,000')).toBeVisible()
  await page.screenshot(shots('m2-05-bill-entry'))
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('heading', { name: 'Bill 1001' })).toBeVisible()
  await page.getByRole('button', { name: 'Post bill' }).click()
  await expect(page.getByText('Posted', { exact: true })).toBeVisible()
  await expect(page.getByText('Unpaid', { exact: true })).toBeVisible()
  await page.screenshot(shots('m2-06-bill-posted'))

  // Payment of the whole bill. The user drops the project split after the bill was ticked:
  // the hidden tick must not block saving; the money is kept as "not assigned".
  await page.getByRole('link', { name: 'Record payment' }).click()
  await expect(page.getByLabel('Amount paid')).toHaveValue(/51,?000/)
  await expect(page.getByText('Which bills does it pay? (optional)')).toBeVisible()
  await page.getByRole('button', { name: 'Remove project' }).click()
  await expect(page.getByText('Which bills does it pay? (optional)')).toBeHidden()
  await page.getByLabel('Reference').fill('Cheque 000123')
  await page.getByRole('button', { name: 'Record payment' }).click()
  await expect(page.getByRole('heading', { name: /Payment PAY-0001/ })).toBeVisible()
  await expect(row(page, 'Not assigned to a project')).toContainText('Rs. 51,000')

  // Accounts assigns it to the project, then matches it to the bill.
  await page.getByRole('button', { name: 'Change split' }).click()
  await page.getByLabel('Project').selectOption({ label: 'P-1 · Ward 5 school building' })
  await page.getByLabel('Amount').fill('51,000')
  await page.getByLabel('Reason').fill('Paid for the school')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Not assigned to a project')).toBeHidden()
  await page.getByRole('link', { name: 'Shrestha Suppliers' }).click()
  await page.getByLabel('Bill', { exact: true }).selectOption({ index: 1 }) // the only unpaid bill, 1001
  await page.getByLabel('Paid from').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Match', exact: true }).click()
  await expect(page.getByText('Matched.')).toBeVisible()
  await page.getByRole('link', { name: 'Payment PAY-0001' }).first().click()
  await expect(page.getByRole('link', { name: /Bill 1001/ })).toBeVisible()
  await page.screenshot(shots('m2-07-payment'))

  // Project: cost from the bill, cash from the payment, unbilled 40 bags not yet cost
  await page.goto('/projects')
  await page.getByRole('link', { name: /Ward 5 school building/ }).click()
  await expect(row(page, 'Recorded cost')).toContainText('Rs. 51,000')
  await expect(row(page, 'Cash paid')).toContainText('Rs. 51,000')
  await expect(row(page, 'Still owed')).toContainText('Rs. 0')
  await expect(row(page, 'Budget used')).toContainText('5.1%')
  await page.screenshot(shots('m2-08-project-cost'))

  // Supplier khata: bill then payment, settled
  await page.goto('/suppliers')
  await page.getByRole('link', { name: /Shrestha Suppliers/ }).click()
  await expect(page.getByRole('link', { name: 'Bill 1001' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Payment PAY-0001' })).toBeVisible()
  await expect(page.getByText('Settled').first()).toBeVisible()
  await page.screenshot(shots('m2-09-khata'))

  expect(errors).toEqual([])
})
