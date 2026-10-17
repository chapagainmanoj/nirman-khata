import { expect, test } from '@playwright/test'
import { runId } from './helpers'

// How to use: reached from More on a phone, lists what this person can do, dated at the end.
const run = runId()

test('owner opens How to use from More and sees every section', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Help Nirman ${run}`)
  await page.getByLabel('Your name').fill('Ram Owner')
  await page.getByLabel('Mobile number or email').fill(`989${run}`)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'How to use' }).click()
  await expect(page.getByRole('heading', { name: 'How to use (Kasari chalaune)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Jyala ra Hajiri (Labour and Attendance)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Khata ra hisab' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible()
  await expect(page.getByText('Last updated:')).toBeVisible()

  await page.getByRole('navigation', { name: 'Help sections' }).getByRole('link', { name: 'Reports' }).click()
  await expect(page).toHaveURL(/#help-reports$/)
})
