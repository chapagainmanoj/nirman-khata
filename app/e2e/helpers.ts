import type { Page } from '@playwright/test'

/**
 * Seven random digits for this spec file's names and phone numbers. Not the clock: parallel
 * workers can load two specs in the same millisecond, and the shared phone prefixes (985…) then
 * collide ("This phone or email already has a login").
 */
export function runId(): string {
  return String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
}

/** Sign out from any screen size: the account menu on tablet and desktop, More on a phone. */
export async function signOut(page: Page) {
  // A form left unsaved may have autosaved a draft; signing out asks before deleting it.
  page.once('dialog', (d) => void d.accept())
  const account = page.getByRole('button', { name: /^Account:/ })
  if (await account.isVisible()) await account.click()
  else await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
}
