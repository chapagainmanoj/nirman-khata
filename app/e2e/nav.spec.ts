import { expect, test, type Page } from '@playwright/test'
import { runId, signOut } from './helpers'

// Navigation by role (UX review): the phone bar follows the role, "+" starts records on the
// current project, counts show work waiting, and detail pages light up their section.
const run = runId()
const ownerPhone = `983${run}`
const staffPhone = `984${run}`
const shots = (name: string) => ({ path: `e2e/.results/screens/${name}.png`, fullPage: true })

async function signIn(page: Page, phone: string, password: string) {
  await page.getByLabel('Mobile number or email').fill(phone)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function newProject(page: Page, code: string, name: string) {
  await page.goto('/projects/new')
  await page.getByLabel('Project code').fill(code)
  await page.getByLabel('Project name').fill(name)
  await page.getByLabel('Contract amount (Thekka Rakam)').fill('10,00,000')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  return page.url().split('/').at(-1)!
}

test('nav follows the role; "+" starts on the current project; counts and sections', async ({ page }) => {
  // Owner sets up two projects, a supplier and a site staff member on both.
  await page.goto('/register')
  await page.getByLabel('Company name').fill(`Nav Nirman ${run}`)
  await page.getByLabel('Your name').fill('Ram Owner')
  await page.getByLabel('Mobile number or email').fill(ownerPhone)
  await page.getByLabel('Password').fill('owner-pass-1')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible()

  const bar = page.getByRole('navigation', { name: 'Main' })
  await expect(bar.getByRole('link', { name: 'Dashboard' })).toBeVisible() // admin bar
  await expect(bar.getByRole('link', { name: 'Slips' })).toBeVisible()
  await expect(bar.getByRole('link', { name: 'Deliveries' })).toHaveCount(0)

  const p1 = await newProject(page, 'P-1', 'Ward 5 school building')
  const p2 = await newProject(page, 'P-2', 'Private house Pokhara')

  await page.goto('/suppliers')
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByLabel('Business name').fill('Shrestha Suppliers')
  await page.getByLabel('Materials supplied').fill('Cement')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /Shrestha Suppliers/ })).toBeVisible()

  await page.goto('/staff')
  await page.getByRole('button', { name: 'Add staff' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Hari Supervisor')
  await page.getByLabel('Mobile number or email').fill(staffPhone)
  await page.getByLabel('Starting password').fill('staff-pass-1')
  await page.getByLabel('P-1 · Ward 5 school building').check()
  await page.getByLabel('P-2 · Private house Pokhara').check()
  await page.locator('form').getByRole('button', { name: 'Add staff' }).click()
  await expect(page.getByText('Hari Supervisor')).toBeVisible()
  await signOut(page)

  // Site staff on a phone: Deliveries in the bar, no Bills or Payments there.
  await signIn(page, staffPhone, 'staff-pass-1')
  await expect(bar.getByRole('link', { name: 'Deliveries' })).toBeVisible()
  await expect(bar.getByRole('link', { name: 'Payments' })).toHaveCount(0)

  // Choose the project once; "+" starts new records on it.
  await page.getByRole('button', { name: /Working on/ }).click()
  await page.getByRole('button', { name: 'P-2 · Private house Pokhara' }).click()
  await expect(page.getByRole('button', { name: /Working on.*P-2/ })).toBeVisible()
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Record' })
  await expect(sheet.getByRole('link').first()).toHaveText(/Daily report/)
  await page.screenshot(shots('nav-01-record-sheet'))
  await sheet.getByRole('link', { name: /New order slip/ }).click()
  await expect(page).toHaveURL(new RegExp(`project=${p2}`))
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue(p2)
  await page.getByLabel('Supplier').selectOption({ label: 'Shrestha Suppliers (Cement)' })
  await page.getByLabel('Material', { exact: true }).selectOption({ label: 'Cement' })
  await page.getByLabel('Quantity').fill('10')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText('Pending approval')).toBeVisible()
  // The slip page lights up Slips and shows the way back.
  await expect(bar.getByRole('link', { name: 'Slips' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Order slips')
  await expect(page).toHaveTitle(/^OS-0001 · .* · NirmanKhata$/)
  const slipId = page.url().split('/').at(-1)!
  // Recording a delivery from the slip shows the way back to it.
  await page.goto(`/deliveries/new?slip=${slipId}`)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('OS-0001')
  // The brand in the phone header goes home: Projects for site staff.
  await page.getByRole('link', { name: /, home$/ }).click()
  await expect(page).toHaveURL(/\/projects$/)

  // Lists follow the sidebar project; the toggle shows which view is on and "All" is temporary.
  const shown = page.getByRole('group', { name: 'Projects shown' })
  const switchTo = async (name: string) => {
    await page.getByRole('button', { name: /Working on/ }).click()
    await page.getByRole('button', { name }).click()
  }
  await page.goto('/slips')
  await page.getByRole('button', { name: /^To approve/ }).click()
  await expect(shown.getByRole('button', { name: 'P-2 · Private house Pokhara' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: /OS-0001/ })).toBeVisible()
  await switchTo('P-1 · Ward 5 school building')
  await expect(page.getByText('No order slips to approve on P-1 yet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'New order slip' })).toHaveAttribute('href', `/slips/new?project=${p1}`)
  await shown.getByRole('button', { name: 'All projects' }).click()
  await expect(shown.getByRole('button', { name: 'All projects' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: /OS-0001/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New order slip' })).toHaveAttribute('href', `/slips/new?project=${p1}`) // still the sidebar project
  await page.screenshot(shots('nav-04-slips-all-projects'))
  await switchTo('P-2 · Private house Pokhara') // a new current project starts filtered again
  await expect(shown.getByRole('button', { name: 'P-2 · Private house Pokhara' })).toHaveAttribute('aria-pressed', 'true')
  // A form opened with no project in its link (a supplier page, a refresh) starts on Working on.
  await page.goto('/slips/new')
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue(p2)
  await page.goto('/deliveries/new')
  await expect(page.getByLabel('Project (site)')).toHaveValue(p2)

  // "All projects": nothing is filled in, and lists show every project with no toggle.
  await page.goto('/projects')
  await switchTo('All projects')
  await expect(page.getByRole('button', { name: /Working on.*All projects/ })).toBeVisible()
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(sheet.getByRole('link', { name: /New order slip/ })).toHaveAttribute('href', '/slips/new')
  await page.goto('/slips')
  await page.getByRole('button', { name: /^To approve/ }).click()
  await expect(shown).toHaveCount(0)
  await expect(page.getByRole('link', { name: /OS-0001/ })).toBeVisible()
  await page.goto('/slips/new')
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue('')
  await page.goto('/projects')
  await switchTo('P-2 · Private house Pokhara')
  await signOut(page)

  // Owner on a desktop: sidebar, a count of slips waiting, and the record menu.
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, ownerPhone, 'owner-pass-1')
  const side = page.getByRole('navigation', { name: 'Main' })
  await expect(side.getByLabel('1 to approve')).toBeVisible()
  await page.screenshot(shots('nav-02-desktop-sidebar'))
  // The dashboard's company-wide count opens the list on all projects, even with P-1 chosen:
  // the P-2 slip it counts must not be hidden by the sidebar project.
  await switchTo('P-1 · Ward 5 school building')
  await page.goto('/dashboard')
  const attention = page.locator('section', { has: page.getByRole('heading', { name: 'Needs attention' }) })
  await attention.getByRole('link', { name: /1 order slip waiting for approval/ }).click()
  await expect(page).toHaveURL(/\/slips\?all=1$/)
  await expect(shown.getByRole('button', { name: 'All projects' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^To approve/ }).click()
  await expect(page.getByRole('link', { name: /OS-0001/ })).toBeVisible()
  // "Enter bill" from a supplier's page names no project: a new line starts on Working on (P-1).
  await page.goto('/suppliers')
  await page.getByRole('link', { name: /Shrestha Suppliers/ }).click()
  await page.getByRole('link', { name: 'Enter bill' }).first().click()
  await page.getByRole('button', { name: 'Add material line' }).click()
  await expect(page.locator('#bl0-p')).toHaveValue(p1)
  await switchTo('P-2 · Private house Pokhara')
  await side.getByRole('link', { name: /Order slips/ }).click()
  await page.getByRole('button', { name: 'To approve (1)' }).click()
  await page.getByRole('link', { name: /OS-0001/ }).click()
  // Wait for the slip itself: menus close on navigation, so one opened mid-navigation shuts again.
  await expect(page).toHaveURL(/\/slips\/[0-9a-f-]{36}$/)
  await expect(side.getByRole('link', { name: /Order slips/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: /OS-0001/ })).toBeVisible()

  const record = page.getByRole('button', { name: 'Record', exact: true })
  await record.click()
  await expect(page.getByRole('link', { name: /Enter bill/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('link', { name: /Enter bill/ })).toHaveCount(0)
  await expect(record).toBeFocused()

  // No page scrolls sideways at any of the three sizes.
  for (const size of [{ width: 393, height: 851 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `${size.width}px`).toBeLessThanOrEqual(0)
    await page.screenshot(shots(`nav-03-slip-${size.width}`))
  }
})

test.describe('desktop with a mouse', () => {
  test.use({ viewport: { width: 1440, height: 800 }, isMobile: false, hasTouch: false })

  test('the sidebar fits a laptop screen; the brand goes home; forms show where they came from', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Company name').fill(`Fit Nirman ${run}`)
    await page.getByLabel('Your name').fill('Sita Owner')
    await page.getByLabel('Mobile number or email').fill(`985${run}`)
    await page.getByLabel('Password').fill('owner-pass-1')
    await page.getByRole('button', { name: 'Create company' }).click()
    await expect(page.getByText('No projects yet')).toBeVisible()

    // Every section, the setup items, the account and the bell without scrolling.
    const list = page.locator('aside .scroll-shadows')
    const { scroll, client } = await list.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
    expect(scroll).toBeLessThanOrEqual(client)
    await expect(page.getByRole('button', { name: /^Account:/ })).toBeInViewport()
    await page.screenshot(shots('nav-05-sidebar-1440x800'))

    // The account menu opens upward from the foot.
    await page.getByRole('button', { name: /^Account:/ }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeInViewport()
    // Setup lives in the account menu, not the sidebar.
    for (const name of ['Staff', 'Catalog', 'Settings']) await expect(page.locator('aside').getByRole('link', { name, exact: true })).toBeVisible()
    await page.screenshot(shots('nav-06-account-up'))
    await page.keyboard.press('Escape')
    const side = page.getByRole('navigation', { name: 'Main' })
    await expect(side.getByRole('link', { name: 'Staff', exact: true })).toHaveCount(0)
    await expect(side.getByRole('link', { name: 'Suppliers' })).toBeVisible()

    // Reports opens from the Dashboard and keeps the Dashboard lit.
    await page.goto('/dashboard')
    await page.getByRole('main').getByRole('link', { name: 'View detailed reports' }).click()
    await expect(page).toHaveURL(/\/reports$/)
    // Wait for the page itself: the URL changes before the lazy page loads, and the old screen
    // (still on the Dashboard) would pass by accident.
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
    await expect(side.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')

    // Forms carry a trail back to where they were started.
    await page.goto('/suppliers')
    await page.getByRole('button', { name: 'Add supplier' }).click()
    await page.getByLabel('Business name').fill('Gurung Hardware')
    await page.getByLabel('Materials supplied').fill('Rod')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('link', { name: /Gurung Hardware/ }).click()
    const supplierId = page.url().split('/').at(-1)!
    await page.goto(`/payments/new?supplier=${supplierId}`)
    const trail = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(trail).toContainText('Suppliers')
    await expect(trail).toContainText('Gurung Hardware')
    await expect(page).toHaveTitle('Record payment · NirmanKhata')
    await page.goto('/bills/new')
    await expect(trail).toContainText('Bills')

    // The brand goes home: the dashboard for the owner.
    await page.getByRole('link', { name: /, home$/ }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
