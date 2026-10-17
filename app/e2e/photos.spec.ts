import { expect, test } from '@playwright/test'
import { runId } from './helpers'

// A photo that fails to upload on a weak site network is kept on the phone, survives a reload,
// and uploads once with "Upload again" (second review #10).
const run = runId()
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test('a photo that did not upload is kept and can be uploaded again', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Photo Nirman ${run}`)
  await page.getByLabel('Your name').fill('Hari Owner')
  await page.getByLabel('Mobile number or email').fill(`+977 984${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill('P-1')
  await page.getByLabel('Project name').fill('Bhandari house')
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('10,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Bhandari house' })).toBeVisible()
  const projectId = page.url().split('/').at(-1)!

  // The network drops every file upload.
  const dropUploads = (route: import('@playwright/test').Route) =>
    route.request().method() === 'PUT' ? route.abort() : route.continue()
  await page.route(/X-Amz-Expires=/, dropUploads)

  await page.goto(`/receipts/new?project=${projectId}`)
  await page.getByLabel('Amount').fill('50,000')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add cheque or voucher photo' }).click()
  await (await chooser).setFiles({ name: 'cheque.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await page.getByRole('button', { name: 'Save payment' }).click()

  // The payment is saved; the photo waits on the phone.
  await expect(page.getByText(/did not upload\. It is kept on this phone/)).toBeVisible()
  await expect(page.getByText('This photo has not uploaded yet. It is kept on this phone.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Cheque photo waiting 1 of 1' })).toBeVisible()

  // Still there after a reload.
  await page.reload()
  await expect(page.getByRole('img', { name: 'Cheque photo waiting 1 of 1' })).toBeVisible()

  // Back online: it uploads once.
  await page.unroute(/X-Amz-Expires=/, dropUploads)
  await page.getByRole('button', { name: 'Upload again' }).click()
  await expect(page.getByRole('img', { name: 'Cheque photo 1 of 1' })).toBeVisible()
  await expect(page.getByText('This photo has not uploaded yet.')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('img', { name: /^Cheque photo \d of \d$/ })).toHaveCount(1)

  // The server finishes the upload but its answer is lost: the retry finds it done, with no copy.
  let lost = false
  await page.route('**/functions/v1/files', async (route) => {
    const confirm = route.request().postDataJSON()?.action === 'confirm'
    if (!confirm || lost) return route.continue()
    lost = true
    await route.fetch() // reaches the server
    return route.abort() // but the phone never hears back
  })
  await page.goto(`/receipts/new?project=${projectId}`)
  await page.getByLabel('Amount').fill('20,000')
  const chooser2 = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add cheque or voucher photo' }).click()
  await (await chooser2).setFiles({ name: 'cheque2.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await page.getByRole('button', { name: 'Save payment' }).click()
  await expect(page.getByRole('img', { name: 'Cheque photo waiting 1 of 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Upload again' }).click()
  await expect(page.getByRole('img', { name: 'Cheque photo 1 of 1' })).toBeVisible()
  await expect(page.getByText('This photo has not uploaded yet.')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('img', { name: /^Cheque photo \d of \d$/ })).toHaveCount(1)
  await expect(page.getByText('This photo has not uploaded yet.')).toHaveCount(0)
  await page.unroute('**/functions/v1/files')

  // A progress photo has no page of its own: once the form closes, "Photos waiting" keeps it in reach.
  await page.route(/X-Amz-Expires=/, dropUploads)
  await page.goto(`/projects/${projectId}?tab=site`)
  await page.getByRole('button', { name: 'Update progress: Overall' }).click()
  await page.getByLabel('Progress %').fill('10')
  const chooser3 = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add photo' }).click()
  await (await chooser3).setFiles({ name: 'wall.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await page.getByRole('button', { name: 'Save progress' }).click()
  await expect(page.getByText(/Progress is saved, but a photo did not upload/)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.reload()
  await page.getByRole('link', { name: 'See it' }).click()
  await expect(page.getByRole('heading', { name: 'Progress update' })).toBeVisible()
  await page.unroute(/X-Amz-Expires=/, dropUploads)
  await page.getByRole('button', { name: 'Upload again' }).click()
  await expect(page.getByText('Nothing waiting')).toBeVisible()
  await page.goto('/projects')
  await expect(page.getByRole('link', { name: 'See it' })).toHaveCount(0)
})
