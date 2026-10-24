import { expect, test, type Page } from '@playwright/test'
import { signOut } from './helpers'

// "/" in the app is each person's home; a page load of "/" in production is the marketing site (site/),
// which this run (the app alone) does not serve. Demo logins from seed.sql.
async function signIn(page: Page, phone: string) {
  await page.getByLabel('Mobile number or email').fill(phone)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('signed out, the app sends "/" and unknown paths to sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/no-such-page')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('link', { name: 'New to NirmanKhata? See what it does' })).toHaveAttribute('href', '/')
})

test('signed in, "/" goes to the dashboard or projects by role; sign-out goes to sign-in', async ({ page }) => {
  await page.goto('/login')
  // Sign-in returns to "/", which sends each person to their home.
  await signIn(page, '9800000001') // owner: sees money
  await expect(page).toHaveURL(/\/dashboard$/)
  // "/home" (the site's "Open app" button) is a page load that ends at the same home.
  await page.goto('/home')
  await expect(page).toHaveURL(/\/dashboard$/)
  await signOut(page)
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page, '9800000003') // site staff: no amounts
  await expect(page).toHaveURL(/\/projects$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/projects$/)
  await page.goto('/home')
  await expect(page).toHaveURL(/\/projects$/)
})

test('registration says how to contact us', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByRole('link', { name: 'WhatsApp +977 9714509893' })).toHaveAttribute('href', /^https:\/\/wa\.me\/9779714509893\?text=/)
  await expect(page.getByRole('link', { name: 'Call +977 9860802349' })).toHaveAttribute('href', 'tel:+9779860802349')
  await expect(page.getByRole('link', { name: 'support@nirman-khata.com' })).toHaveAttribute('href', /^mailto:support@nirman-khata\.com\?subject=/)
})
