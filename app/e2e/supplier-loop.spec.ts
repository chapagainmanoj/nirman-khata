import { expect, test, type Page } from '@playwright/test'
import { runId } from './helpers'

// Milestone 2 walk-through on a phone: supplier -> slip -> approval -> partial delivery ->
// bill from the delivery -> post -> payment -> project cost and supplier khata.
const run = runId()
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return errors
}

// A tiny valid image for photo uploads.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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
  await page.goto('/suppliers')
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
  const progress = page.getByRole('list', { name: 'Progress' })
  await expect(progress).toContainText('Approved')
  await expect(progress).toContainText('Not sent yet')
  await expect(progress).toContainText('Not received')
  await page.screenshot(shots('m2-03-slip-approved'))

  // Delivery: 60 of 100 arrive
  await page.getByRole('link', { name: 'Record delivery' }).click()
  await expect(page.getByLabel(/^Received \(/)).toHaveValue('100')
  await page.getByLabel(/^Received \(/).fill('60')
  await page.getByLabel('Challan number').fill('CH-501')
  // The phone reloads mid-entry: the challan is still there.
  await page.waitForTimeout(800)
  await page.reload()
  await expect(page.getByText('Restored your unsaved delivery.')).toBeVisible()
  await expect(page.getByLabel('Challan number')).toHaveValue('CH-501')
  await expect(page.getByLabel(/^Received \(/)).toHaveValue('60')
  await page.getByRole('button', { name: 'Save delivery' }).click()
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to order slip' }).click()
  await expect(page.getByText('Received 60 · Pending 40')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Progress' })).toContainText(/Partly received\s*60 \/ 100/)
  await page.screenshot(shots('m2-04-slip-partly-received'))

  // Bill from the delivery card on the project ("Enter bill for this"); only the rate is typed.
  await page.goto('/projects')
  await page.getByRole('link', { name: /Ward 5 school building/ }).click()
  // Delivered but not billed is listed under Spent, not added in.
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('1 delivered item with no bill yet')
  // The to-do sits on the Activity tab and opens the project's deliveries.
  await page.getByRole('tab', { name: 'Activity' }).click()
  await page.getByRole('button', { name: 'Enter bills' }).click()
  await page.getByRole('link', { name: 'Enter bill for this' }).click()
  await expect(page.getByLabel('Quantity')).toHaveValue('60')
  await page.getByLabel('Bill number').fill('1001')
  await page.getByLabel('Rate per unit').fill('850')
  await expect(page.getByText('Total Rs. 51,000')).toBeVisible()
  // The paper bill total is typed too; a wrong one shows the gap at once.
  await page.getByLabel('Total on the paper bill').fill('51,500')
  await expect(page.getByText('Rs. 500 missing: the paper bill says Rs. 51,500.')).toBeVisible()
  await page.getByLabel('Total on the paper bill').fill('51,000')
  await expect(page.getByText('Matches the paper bill.')).toBeVisible()
  await page.screenshot(shots('m2-05-bill-entry'))
  await page.getByRole('button', { name: 'Save and post' }).click()
  await expect(page.getByRole('heading', { name: 'Bill 1001' })).toBeVisible()
  await expect(page.getByText('Posted', { exact: true })).toBeVisible()
  await expect(page.getByText('Unpaid', { exact: true })).toBeVisible()
  await page.screenshot(shots('m2-06-bill-posted'))
  const billUrl = page.url()
  // The delivery list now shows it billed, so there is no bill to enter; its page says how much,
  // and a billed delivery cannot be deleted.
  await page.goto('/deliveries')
  const delivery = page.getByRole('row').filter({ hasText: 'Challan CH-501' })
  await expect(delivery).toContainText('60 bag')
  await expect(delivery).toContainText('Billed')
  await expect(delivery.getByRole('link', { name: 'Enter bill for this' })).toHaveCount(0)
  // Search finds the challan by number or supplier; the date filter and a miss show the way back.
  const search = page.getByRole('searchbox', { name: 'Search' })
  await search.fill('zz-none')
  await expect(page.getByText('No deliveries match “zz-none”.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(delivery).toBeVisible()
  await search.fill('shrestha')
  await expect(delivery).toBeVisible()
  await page.getByRole('combobox', { name: 'When' }).selectOption('last-month')
  await expect(page.getByText(/No deliveries match “shrestha” in these dates/)).toBeVisible()
  await page.getByRole('combobox', { name: 'When' }).selectOption('this-month')
  await search.fill('CH-501')
  await expect(delivery).toBeVisible()
  await expect(page).toHaveURL(/q=CH-501/)
  await page.screenshot(shots('m2-06b-deliveries'))
  await delivery.getByRole('link', { name: 'Shrestha Suppliers' }).click()
  await expect(page.getByRole('heading', { name: 'Challan CH-501' })).toBeVisible()
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'What came' }) })).toContainText('60 billed')
  await expect(page.getByRole('button', { name: 'Return items' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await page.screenshot(shots('m2-06c-delivery'))
  // Back to the list keeps the search.
  await page.goBack()
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('CH-501')
  await expect(delivery).toBeVisible()
  // Order slips: a search that misses on Open offers All, where a finished slip may be.
  await page.goto('/slips')
  await page.getByRole('searchbox', { name: 'Search' }).fill('OS-9999')
  await expect(page.getByText('No open order slips match.')).toBeVisible()
  await page.getByRole('button', { name: 'Search all order slips' }).click()
  await expect(page.getByText('No order slips match.')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search' }).fill('OS-0001')
  await expect(page.getByRole('link', { name: /OS-0001/ })).toBeVisible()
  await page.goto(billUrl)

  // The supplier page answers what a contractor asks: what is unpaid (and pay it from there), what
  // is still to come, and the supplier's latest rates. Nothing to match yet, so no Match card.
  await page.getByRole('link', { name: 'Shrestha Suppliers' }).click()
  await expect(page.getByRole('heading', { name: 'To pay' })).toBeVisible()
  const unpaid = page.locator('section', { has: page.getByRole('heading', { name: 'Unpaid bills' }) })
  await expect(unpaid).toContainText('Bill 1001')
  await expect(unpaid).toContainText('Rs. 51,000')
  const coming = page.locator('section', { has: page.getByRole('heading', { name: 'On the way and not billed' }) })
  // 60 of the 100 bags came and are billed; the slip still waits for 40.
  await expect(coming).toContainText('Ordered, still to come')
  await expect(coming.getByRole('link', { name: /OS-0001/ })).toContainText('Part received')
  await expect(page.getByRole('heading', { name: 'Match payments to bills' })).toHaveCount(0)
  await page.screenshot(shots('m2-06a-supplier'))
  // Their rates is a link beside Call and WhatsApp, to its own page.
  await page.getByRole('link', { name: 'Their rates' }).click()
  await expect(page.getByRole('heading', { name: 'Their rates', level: 1 })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Cement')
  await expect(page.getByRole('main')).toContainText('Rs. 850')
  await page.goBack()

  // Payment from the supplier page: the bill comes ticked and sets the amount. Peski is not offered
  // while the bill is unpaid. Accounts unticks it and pays the 51,000 anyway: it is overpaid on the
  // project, to be matched to the bill afterwards.
  await unpaid.getByRole('link', { name: 'Pay bill 1001' }).click()
  await expect(page.getByLabel('Amount paid')).toHaveValue(/51,?000/)
  await expect(page.getByText('Which bills does it pay?')).toBeVisible()
  await expect(page.getByLabel('Bill 1001 · P-1')).toBeChecked()
  await expect(page.getByLabel('This is peski')).toBeHidden()
  await expect(page.getByLabel('Reference')).toBeHidden() // cash needs no reference
  await page.screenshot(shots('m2-06b-payment-form'))
  await page.getByLabel('Bill 1001 · P-1').uncheck()
  await page.getByLabel('Amount paid').fill('51,000')
  await expect(page.getByText(/Extra Rs\. 51,000 is overpaid on/)).toBeVisible()
  await page.getByLabel('How').selectOption('cheque')
  await page.getByLabel('Reference').fill('Cheque 000123')
  await page.getByRole('button', { name: 'Record payment' }).click()
  await expect(page.getByRole('heading', { name: /Payment PAY-0001/ })).toBeVisible()
  await expect(page.getByText('It counts as overpaid until it is.')).toBeVisible()

  // Accounts matches it to the bill, in the Payments tab. Unpaid bills already counts the payment
  // against the bill, so it agrees with "To pay".
  await page.getByRole('link', { name: 'Shrestha Suppliers' }).click()
  await page.getByRole('tab', { name: 'Payments' }).click()
  // The Match card reads the same open items; once it shows, Unpaid bills has had its data too.
  await expect(page.getByRole('heading', { name: 'Match payments to bills' })).toBeVisible()
  await expect(page.getByText(/^Tirnu parne/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unpaid bills' })).toHaveCount(0)
  await page.getByLabel('Bill', { exact: true }).selectOption({ index: 1 }) // the only unpaid bill, 1001
  await page.getByLabel('Paid from').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Match', exact: true }).click()
  await expect(page.getByText('Matched.')).toBeVisible()
  await page.getByRole('link', { name: /PAY-0001/ }).first().click()
  await expect(page.getByRole('link', { name: /Bill 1001/ })).toBeVisible()
  await page.screenshot(shots('m2-07-payment'))

  // Project: cost from the bill, cash from the payment, unbilled 40 bags not yet cost
  await page.goto('/projects')
  await page.getByRole('link', { name: /Ward 5 school building/ }).click()
  // Summary strip and the contract and budget card show the same figure.
  await expect(row(page, 'Spent').first()).toContainText('Rs. 51,000')
  await expect(row(page, 'Spent').last()).toContainText('Rs. 51,000')
  await expect(row(page, 'Paid').last()).toContainText('Rs. 51,000')
  await expect(row(page, 'Due').last()).toContainText('Rs. 0')
  await expect(page.getByRole('progressbar', { name: 'Budget used' })).toHaveAttribute('aria-valuenow', '5')
  await page.screenshot(shots('m2-08-project-cost'))

  // Supplier khata: bill then payment, settled
  await page.goto('/suppliers')
  await page.getByRole('link', { name: /Shrestha Suppliers/ }).click()
  await expect(page.getByRole('link', { name: 'Bill 1001' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Payment PAY-0001' })).toBeVisible()
  await expect(page.getByText('Nothing to pay').first()).toBeVisible()
  await page.screenshot(shots('m2-09-khata'))

  // Paper first: a bill photographed before anything is typed is saved as an untyped draft.
  await page.getByRole('link', { name: 'Enter bill' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Take bill photo' }).click()
  await (await chooser).setFiles({ name: 'bill.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await expect(page.getByRole('img', { name: 'Bill photo 1 of 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('heading', { name: 'Bill (not typed yet)' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Bill photo 1 of 1' })).toBeVisible()
  await expect(page.getByText('Enter the bill number from the paper bill')).toBeVisible()

  expect(errors).toEqual([])
})
