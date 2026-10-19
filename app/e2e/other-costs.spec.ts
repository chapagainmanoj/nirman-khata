import { expect, test, type Page } from '@playwright/test'
import { runId } from './helpers'

// Milestone 3 walk-through on a phone: labour paid now, a weekly labour batch (with the
// near-duplicate check), an other expense to a new payee, and subcontract peski -> bill ->
// approval -> match. Project cost, cash and amounts owed must add up.
const run = runId()
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  page.on('response', async (r) => {
    if (r.status() < 400) return
    const body = await r.text().catch(() => '')
    // The near-duplicate labour warning is an expected refusal that the page turns into a question.
    if (!body.includes('near_duplicate:')) errors.push(`${r.status()} ${r.url()} ${body}`)
  })
  return errors
}

const row = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')

test('labour, expenses and subcontract work: cost and balances add up', async ({ page }) => {
  const errors = trackErrors(page)

  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Kaam Nirman ${run}`)
  await page.getByLabel('Your name').fill('Sita Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 984${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Thapa house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('20,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Thapa house' })).toBeVisible()
  const projectUrl = page.url()

  // Labour for today, paid in cash on the spot.
  await page.getByRole('tab', { name: 'Labour & costs' }).click()
  await page.getByRole('link', { name: 'Enter labour' }).click()
  await page.getByLabel('Crew').selectOption({ label: 'Site crew' })
  await page.getByLabel('People', { exact: true }).fill('5')
  await page.getByLabel('Labour cost for the day').fill('6,000')
  await expect(page.getByLabel('Paid now')).toBeChecked()
  await page.screenshot(shots('m3-01-labour-day'))
  await page.getByRole('button', { name: 'Save labour' }).click()
  await expect(page.getByRole('heading', { name: 'Labour saved' })).toBeVisible()
  await expect(page.getByText(/One day of labour, Rs\. 6,000\. Paid now \(PAY-0001\)/)).toBeVisible()

  // The past week for the same crew, not paid yet. Today is already entered, so it asks first.
  await page.getByRole('button', { name: 'Enter more' }).click()
  await page.getByRole('radio', { name: 'Several days' }).click()
  await page.getByLabel('Total for these days').fill('7,000')
  await page.getByLabel('Paid now').uncheck()
  await page.getByRole('button', { name: 'Save labour' }).click()
  await page.getByRole('button', { name: 'Yes, save it too' }).click()
  await expect(page.getByText(/7 days of labour, Rs\. 7,000\. Not paid yet/)).toBeVisible()

  // An other expense to a payee typed for the first time, paid now.
  await page.goto(projectUrl)
  await page.getByRole('tab', { name: 'Labour & costs' }).click()
  await page.getByRole('link', { name: 'Enter other expense' }).click()
  await page.getByLabel('Amount').fill('4,500')
  await page.getByLabel('What for').fill('JCB 3 hours')
  await page.getByLabel('Paid to').fill('Gurung JCB')
  await page.getByLabel('Type of service').fill('JCB owner')
  await page.screenshot(shots('m3-02-expense'))
  await page.getByRole('button', { name: 'Save other expense' }).click()
  await expect(page.getByRole('heading', { name: 'Other expense saved' })).toBeVisible()
  await expect(page.getByText(/Paid now \(PAY-0002\)/)).toBeVisible()

  // Subcontractor and a lump-sum work package.
  await page.goto('/subcontractors')
  await page.getByRole('button', { name: 'Add subcontractor' }).click()
  await page.getByLabel('Name').fill('Tamang Plaster')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /Tamang Plaster/ })).toBeVisible()

  await page.goto(projectUrl)
  await page.getByRole('tab', { name: 'Subcontract' }).click()
  await page.getByRole('link', { name: 'New work package' }).click()
  await page.getByLabel('Subcontractor').selectOption({ label: 'Tamang Plaster' })
  await page.getByLabel('Work', { exact: true }).fill('Plaster, ground floor')
  await page.getByLabel('Agreed amount').fill('1,00,000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Plaster, ground floor' })).toBeVisible()
  const packageUrl = page.url()

  // Peski of 20,000 before any work is approved.
  await page.getByRole('link', { name: 'Pay peski or bill' }).click()
  await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible()
  await expect(page.getByText('Tamang Plaster').first()).toBeVisible()
  await page.getByLabel('Amount paid').fill('20,000')
  await page.getByRole('button', { name: 'Record payment' }).click()
  await expect(page.getByRole('heading', { name: /Payment PAY-0003/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change split' })).toBeHidden()

  // Running bill of 30,000: the owner adds and approves it in one step, then pays it. The 20,000
  // peski comes off first (Farchhyaut); 10,000 is left to pay in cash, kept for later here.
  await page.goto(packageUrl)
  await page.getByRole('button', { name: 'Add bill' }).click()
  await page.getByLabel('Amount', { exact: true }).fill('30,000')
  await page.getByLabel('Bill number').fill('RA-1')
  await page.getByRole('button', { name: 'Save and pay' }).click()
  await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible()
  await expect(page.getByText(/Less money they hold/).locator('..')).toContainText('Rs. 20,000')
  await expect(page.getByText('To pay in cash').locator('..')).toContainText('Rs. 10,000')
  await page.getByLabel('Amount paid').fill('0')
  await page.getByRole('button', { name: 'Pay from money they hold' }).click()
  await expect(page.getByText('Rs. 20,000 taken from money they hold')).toBeVisible()
  await expect(row(page, 'Work done (cost)')).toContainText('Rs. 30,000')
  await expect(row(page, 'Paid').first()).toContainText('Rs. 20,000') // package total; the bill row also says Paid
  await expect(row(page, 'Balance')).toContainText('Rs. 10,000')
  await page.screenshot(shots('m3-03-package'))

  // The subcontractor page leads with the contract: agreed, paid, left, and due now.
  await page.getByRole('link', { name: 'Tamang Plaster' }).click()
  const contract = page.locator('section', { has: page.getByRole('heading', { name: 'Contract', exact: true }) })
  await expect(contract).toContainText('Rs. 1,00,000')
  await expect(contract.getByText('Left to pay on the contract').locator('xpath=following-sibling::dd[1]')).toContainText('Rs. 80,000')
  await expect(contract.getByText('Due now').locator('xpath=following-sibling::dd[1]')).toContainText('Rs. 10,000')
  // No second balance card on the Khata tab: just the opening balance (none yet) and the entries.
  await expect(page.getByRole('heading', { name: 'Balance', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Set opening balance' })).toBeVisible()

  // Project: cost 6,000 + 7,000 + 4,500 + 30,000; cash 6,000 + 4,500 + 20,000;
  // still owed 7,000 to the crew and 10,000 to the subcontractor.
  await page.goto(projectUrl)
  // Summary strip and the contract and budget card show the same figure.
  await expect(row(page, 'Cost so far')).toContainText('Rs. 47,500')
  await expect(row(page, 'Spent').last()).toContainText('Rs. 47,500')
  await expect(row(page, 'Paid').last()).toContainText('Rs. 30,500')
  await expect(row(page, 'Due').last()).toContainText('Rs. 17,000')
  await expect(page.getByText('Shows labour you entered')).toBeHidden()
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('Rs. 47,500')
  await page.screenshot(shots('m3-04-project'))
  await page.getByRole('tab', { name: 'Labour & costs' }).click()
  await expect(page.getByText('JCB 3 hours')).toBeVisible()
  await page.screenshot(shots('m3-04b-project-labour'))

  // The crew khata shows the unpaid week.
  await page.goto('/crews')
  await page.getByRole('link', { name: /Site crew/ }).click()
  await expect(page.getByText('Rs. 7,000').first()).toBeVisible()
  await page.screenshot(shots('m3-05-crew'))

  // A rate package: a quantity that cannot be stored is refused, not saved as "no agreed value".
  await page.goto(projectUrl)
  await page.getByRole('tab', { name: 'Subcontract' }).click()
  await page.getByRole('link', { name: 'New work package' }).click()
  await page.getByLabel('Subcontractor').selectOption({ label: 'Tamang Plaster' })
  await page.getByLabel('Work', { exact: true }).fill('Plaster, first floor')
  await page.getByLabel('How it is priced').selectOption('rate')
  await page.getByLabel('Rate per').selectOption({ index: 1 })
  await page.getByLabel('Rate', { exact: true }).fill('500')
  await page.getByLabel('Expected quantity').fill('200')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Plaster, first floor' })).toBeVisible()
  await expect(page.getByText('Rs. 1,00,000').first()).toBeVisible()
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByLabel('Expected quantity').fill('200.0005')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Expected quantity: a number with at most 3 decimals, e.g. 120.5.')).toBeVisible()
  await page.getByLabel('Expected quantity').fill('200.5')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Plaster, first floor' })).toBeVisible()
  await expect(page.getByText('Rs. 1,00,250').first()).toBeVisible()

  expect(errors).toEqual([])
})
