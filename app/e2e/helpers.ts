import type { Page } from '@playwright/test'

/** Sign out from any screen size: the account menu on tablet and desktop, More on a phone. */
export async function signOut(page: Page) {
  // A form left unsaved may have autosaved a draft; signing out asks before deleting it.
  page.once('dialog', (d) => void d.accept())
  const account = page.getByRole('button', { name: /^Account:/ })
  if (await account.isVisible()) await account.click()
  else await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
}
