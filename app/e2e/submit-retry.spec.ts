import { expect, test, type Page } from '@playwright/test'
import { signOut } from './helpers'

// A slip or bill whose "send" went through but whose answer was lost can be sent again: the retry
// finds it already sent instead of failing on a record that is no longer a draft (second review #11).
const run = Date.now().toString().slice(-7)
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** The next call to this RPC reaches the server, but the phone never hears back. */
async function loseNextAnswer(page: Page, rpc: string) {
  let lost = false
  await page.route(`**/rest/v1/rpc/${rpc}`, async (route) => {
    if (lost) return route.continue()
    lost = true
    await route.fetch()
    return route.abort()
  })
}

test('a send whose answer was lost is not stuck: the retry finds it sent', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Retry Nirman ${run}`)
  await page.getByLabel('Your name').fill('Hari Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 983${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Bhandari house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('10,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Bhandari house' })).toBeVisible()

  await page.goto('/suppliers')
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByLabel('Business name').fill('Shrestha Suppliers')
  await page.getByLabel('Materials supplied').fill('Cement')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /Shrestha Suppliers/ })).toBeVisible()

  // Slip: the submit goes through, its answer is lost, the user taps again.
  await page.goto('/slips/new')
  await page.getByLabel('Supplier').selectOption({ label: 'Shrestha Suppliers (Cement)' })
  await page.getByLabel('Material', { exact: true }).selectOption({ label: 'Cement' })
  await page.getByLabel('Quantity').fill('100')
  await loseNextAnswer(page, 'submit_slip')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  // The phone is reloaded before trying again: the form comes back as it was sent.
  await page.reload()
  await expect(page.getByText('Restored your unsaved slip.')).toBeVisible()
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText('This slip had already been sent; it was not sent twice.')).toBeVisible()
  await expect(page.getByText('Pending approval')).toBeVisible()
  await page.goto('/slips')
  await expect(page.getByRole('button', { name: 'To approve (1)' })).toBeVisible()

  // Lost again, but this time the slip is rejected before the retry: the retry sends it anew.
  await page.goto('/slips/new')
  await page.getByLabel('Supplier').selectOption({ label: 'Shrestha Suppliers (Cement)' })
  await page.getByLabel('Material', { exact: true }).selectOption({ label: 'Cement' })
  await page.getByLabel('Quantity').fill('50')
  await loseNextAnswer(page, 'submit_slip')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.goto('/slips')
  await page.getByRole('button', { name: 'To approve (2)' }).click()
  await page.getByRole('link', { name: /OS-0002/ }).click()
  await page.getByRole('button', { name: 'Reject' }).click()
  await page.getByLabel('Reason').fill('Order 60 bags')
  await page.getByRole('button', { name: 'Reject' }).last().click()
  await expect(page.getByText('Rejected: Order 60 bags')).toBeVisible()
  await page.goto('/slips/new')
  await expect(page.getByText('Restored your unsaved slip.')).toBeVisible()
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText('Pending approval')).toBeVisible()
  await expect(page.getByText('This slip had already been sent; it was not sent twice.')).toHaveCount(0)
  await page.goto('/slips')
  await expect(page.getByRole('button', { name: 'To approve (2)' })).toBeVisible()

  // Site staff hands a photo-only bill to Accounts; the same lost answer.
  const staffPhone = `981${run}`
  await page.goto('/staff')
  await page.getByRole('button', { name: 'Add staff' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Gopal Site')
  await page.getByLabel('Mobile number or email').fill(staffPhone)
  await page.getByLabel('Starting password').fill('staff-pass-1')
  await page.getByLabel('P-1 · Bhandari house').check()
  await page.locator('form').getByRole('button', { name: 'Add staff' }).click()
  await expect(page.getByText('Gopal Site')).toBeVisible()
  await signOut(page)
  await page.getByLabel('Mobile number or email').fill(staffPhone)
  await page.getByLabel('Password').fill('staff-pass-1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Bhandari house')).toBeVisible()

  await page.goto('/bills/new')
  await page.getByLabel('Supplier').selectOption({ label: 'Shrestha Suppliers' })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Take bill photo' }).click()
  await (await chooser).setFiles({ name: 'bill.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await loseNextAnswer(page, 'submit_bill')
  await page.getByRole('button', { name: 'Send to Accounts' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Send to Accounts' }).click()
  await expect(page.getByText('This bill had already been sent to Accounts; it was not sent twice.')).toBeVisible()
})
