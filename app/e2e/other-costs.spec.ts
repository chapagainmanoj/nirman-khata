import { expect, test, type Page } from '@playwright/test'

// Milestone 3 walk-through on a phone: labour paid now, a weekly labour batch (with the
// near-duplicate check), an other expense to a new payee, and subcontract peski -> claim ->
// approval -> match. Project cost, cash and amounts owed must add up.
const run = Date.now().toString().slice(-7)
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
  await page.getByLabel('Payee type').fill('JCB owner')
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

  // Running bill claimed 30,000, approved in full: cost from the approval date.
  await page.goto(packageUrl)
  await page.getByRole('button', { name: 'Add claim' }).click()
  await page.getByLabel('Amount claimed').fill('30,000')
  await page.getByLabel('Claim or bill number').fill('RA-1')
  await page.getByRole('button', { name: 'Save claim' }).click()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await page.getByRole('button', { name: 'Approve Rs. 30,000' }).click()
  await expect(row(page, 'Approved work (cost)')).toContainText('Rs. 30,000')
  await page.screenshot(shots('m3-03-package'))

  // Farchhyaut: match the peski to the approved claim on the subcontractor page.
  await page.getByRole('link', { name: 'Tamang Plaster' }).click()
  await page.getByLabel('Unpaid charge').selectOption({ index: 1 })
  await page.getByLabel('Paid from').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Match', exact: true }).click()
  await expect(page.getByText('Matched.')).toBeVisible()
  await page.goto(packageUrl)
  await expect(row(page, 'Paid').first()).toContainText('Rs. 20,000') // package total; the claim row also says Paid
  await expect(row(page, 'Balance')).toContainText('Rs. 10,000')

  // Project: cost 6,000 + 7,000 + 4,500 + 30,000; cash 6,000 + 4,500 + 20,000;
  // still owed 7,000 to the crew and 10,000 to the subcontractor.
  await page.goto(projectUrl)
  // Summary strip and the contract and budget card show the same figure.
  await expect(row(page, 'Spent').first()).toContainText('Rs. 47,500')
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

  expect(errors).toEqual([])
})
