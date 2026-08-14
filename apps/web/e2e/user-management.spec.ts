import { test, expect, Page, APIRequestContext, request } from '@playwright/test'

/**
 * These specs drifted badly against the UI and were 10/11 failing before this
 * rewrite. Four things had changed underneath them:
 *
 *  - "Profile Name" was renamed to "Username" on login, register and account.
 *  - Registration now always assigns the `unverified` role, and `/account`
 *    carries `requiresVerified` — so a freshly-registered user is bounced to
 *    /pending and can never reach the account page. Every account-page test
 *    needs an admin approval step first.
 *  - The account page became tabbed (General / Security / Interface / Market /
 *    Notifications / FIO / Discord / Danger Zone), so fields that used to sit
 *    on one flat page now need their tab opened first.
 *  - Display name, email and the FIO fields auto-save on blur; the old
 *    "Save Changes" button no longer exists.
 *
 * Nav items are icon-only but now carry `aria-label`, so they are addressable
 * by role. Prefer `getByRole` over CSS/icon-class selectors: it asserts the
 * control is reachable by assistive tech at the same time, so the accessibility
 * gap that made the original specs unwritable cannot come back unnoticed.
 */

const testPassword = 'TestPassword123!'

/** Seeded admin from `make db-reset-mock` (apps/api/src/scripts/mock-data.sql). */
const ADMIN = { username: 'admin', password: 'password123' }

/**
 * Approve a pending user, via the API rather than the admin UI.
 *
 * Registration only ever grants `unverified`, and `/account` requires a
 * verified role — so without this the account tests cannot reach the page at
 * all. Done over HTTP deliberately: driving the admin screens would make every
 * account test depend on the admin UI too, so an unrelated change there would
 * fail a dozen specs that are not about administration.
 *
 * Requires the mock data to be loaded (`make db-reset-mock`).
 */
async function approveUser(username: string): Promise<void> {
  const ctx: APIRequestContext = await request.newContext({
    baseURL: 'http://localhost:5173',
    // The CSRF middleware rejects cookie-authenticated mutations that carry no
    // Origin (apps/api/src/middleware/csrf.ts). Browsers always send one;
    // Playwright's API context does not, so set it explicitly rather than
    // weakening the check. This is the header a real browser would send.
    extraHTTPHeaders: { Origin: 'http://localhost:5173' },
  })
  try {
    const login = await ctx.post('/api/auth/login', { data: ADMIN })
    if (!login.ok()) {
      throw new Error(
        `Admin login failed (${login.status()}). Is the mock data loaded? Run \`make db-reset-mock\`.`
      )
    }

    const pending = await ctx.get('/api/admin/pending-approvals')
    const users = (await pending.json()) as { id: number; username: string }[]
    const user = users.find(u => u.username === username)
    if (!user) throw new Error(`No pending approval found for ${username}`)

    const approve = await ctx.post(`/api/admin/users/${user.id}/approve`, {
      data: { roleId: 'member' },
    })
    if (!approve.ok()) {
      throw new Error(`Approve failed for ${username} (${approve.status()})`)
    }
  } finally {
    await ctx.dispose()
  }
}

/** Register a fresh user and return the username. Leaves the browser on /login. */
async function registerUser(page: Page): Promise<string> {
  const username = `testuser${Date.now()}${Math.floor(Math.random() * 1000)}`
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(testPassword)
  await page.getByLabel('Confirm Password').fill(testPassword)
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  await expect(page.locator('.v-alert')).toContainText('Registration successful')
  await expect(page).toHaveURL('/login', { timeout: 5000 })
  return username
}

/**
 * Log in and wait for the post-login redirect.
 *
 * A brand-new account has only the `unverified` role, which the router sends to
 * /pending rather than /market — so callers say which they expect instead of
 * this helper assuming the verified path.
 */
async function login(
  page: Page,
  username: string,
  password: string,
  expectedPath: string | RegExp = /\/(market|pending)/
): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL(expectedPath)
}

/**
 * Register, approve, and log in — the shortest path to a user who can actually
 * open /account. Returns the username.
 */
async function registerApprovedUser(page: Page): Promise<string> {
  const username = await registerUser(page)
  await approveUser(username)
  await login(page, username, testPassword, '/market')
  return username
}

/**
 * Open a tab on the account page.
 *
 * Tabs carry visible text (unlike the nav icons), so they are addressable by
 * role. Waits for the tab to report selected, because Vuetify mounts the panel
 * asynchronously and filling a field too early silently targets a hidden input.
 */
async function openAccountTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
}

test.describe('User Management Flow', () => {
  test('should register a new user account', async ({ page }) => {
    const username = `testuser${Date.now()}`
    await page.goto('/register')

    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password', { exact: true }).fill(testPassword)
    await page.getByLabel('Confirm Password').fill(testPassword)

    await page.getByRole('button', { name: 'Register', exact: true }).click()

    await expect(page.locator('.v-alert')).toContainText('Registration successful')

    // The view redirects on a 2s timer.
    await expect(page).toHaveURL('/login', { timeout: 5000 })
  })

  test('should login with registered credentials', async ({ page }) => {
    const username = await registerUser(page)

    await page.goto('/login')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill(testPassword)
    await page.getByRole('button', { name: 'Login' }).click()

    // Registration only grants `unverified`, so login lands on /pending rather
    // than /market until an administrator approves the account.
    await expect(page).toHaveURL('/pending')
    await expect(page.getByText('Registration Pending')).toBeVisible()
  })

  test('should view user profile', async ({ page }) => {
    const username = await registerApprovedUser(page)

    // Navigate via the navbar rather than page.goto, so this also covers the
    // nav link being reachable by its accessible name.
    await page.getByRole('banner').getByRole('link', { name: 'Account' }).click()
    await expect(page).toHaveURL('/account')

    await expect(page.getByLabel('Username')).toHaveValue(username)
    await expect(page.getByLabel('Display Name')).toHaveValue(username)

    // Roles render as chips, not a labelled field.
    await expect(page.locator('.v-chip').filter({ hasText: 'Member' })).toBeVisible()
  })

  test('should update profile settings', async ({ page }) => {
    const username = await registerApprovedUser(page)
    await page.goto('/account')

    await expect(page.getByLabel('Display Name')).toHaveValue(username)

    // Display name auto-saves on blur — there is no Save button any more.
    const newDisplayName = `${username} Updated`
    await page.getByLabel('Display Name').fill(newDisplayName)
    await page.getByLabel('Display Name').blur()

    // FIO settings moved to their own tab and also save on blur.
    await openAccountTab(page, 'FIO')
    await page.getByLabel('FIO Username').fill('fio_testuser')
    await page.getByLabel('FIO Username').blur()

    // Reload and confirm both round-tripped to the server.
    await page.reload()
    await expect(page.getByLabel('Display Name')).toHaveValue(newDisplayName)
    await openAccountTab(page, 'FIO')
    await expect(page.getByLabel('FIO Username')).toHaveValue('fio_testuser')
  })

  test('should change password successfully', async ({ page }) => {
    const username = await registerApprovedUser(page)
    await page.goto('/account')
    await openAccountTab(page, 'Security')

    const newPassword = 'NewTestPassword456!'

    await page.getByLabel('Current Password').fill(testPassword)
    await page.getByLabel('New Password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm New Password').fill(newPassword)
    await page.getByRole('button', { name: 'Update Password' }).click()

    await expect(page.locator('.v-snackbar')).toContainText('Password updated successfully')

    await expect(page.getByLabel('Current Password')).toHaveValue('')
    await expect(page.getByLabel('New Password', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Confirm New Password')).toHaveValue('')

    // Changing the password bumps tokenVersion, so the session is already dead;
    // go straight to /login rather than driving the logout dialog.
    await login(page, username, newPassword, '/market')
  })

  test('should show error for wrong current password', async ({ page }) => {
    const username = await registerApprovedUser(page)
    await page.goto('/account')
    await openAccountTab(page, 'Security')

    await page.getByLabel('Current Password').fill('WrongPassword123!')
    await page.getByLabel('New Password', { exact: true }).fill('AnotherPassword789!')
    await page.getByLabel('Confirm New Password').fill('AnotherPassword789!')
    await page.getByRole('button', { name: 'Update Password' }).click()

    await expect(page.locator('.v-snackbar')).toContainText('Current password is incorrect')
  })

  test('should show error for mismatched passwords', async ({ page }) => {
    const username = await registerApprovedUser(page)
    await page.goto('/account')
    await openAccountTab(page, 'Security')

    await page.getByLabel('Current Password').fill(testPassword)
    await page.getByLabel('New Password', { exact: true }).fill('AnotherPassword789!')
    await page.getByLabel('Confirm New Password').fill('DifferentPassword789!')
    await page.getByRole('button', { name: 'Update Password' }).click()

    await expect(page.locator('.v-snackbar')).toContainText('New passwords do not match')
  })

  test('should show error for short password', async ({ page }) => {
    const username = await registerApprovedUser(page)
    await page.goto('/account')
    await openAccountTab(page, 'Security')

    await page.getByLabel('Current Password').fill(testPassword)
    await page.getByLabel('New Password', { exact: true }).fill('short')
    await page.getByLabel('Confirm New Password').fill('short')
    await page.getByRole('button', { name: 'Update Password' }).click()

    await expect(page.locator('.v-snackbar')).toContainText(
      'Password must be at least 8 characters'
    )
  })

  test('should log out through the confirmation dialog', async ({ page }) => {
    await registerApprovedUser(page)

    // Covered because logout now revokes an httpOnly cookie server-side — a
    // round-trip that cannot be verified from local state.
    //
    // Both the navbar button and the dialog's confirm button are named
    // "Logout", so each click is scoped to its own landmark rather than
    // relying on an ambiguous page-wide match.
    await page.getByRole('banner').getByRole('button', { name: 'Logout' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Logout' }).click()

    await expect(page).toHaveURL('/login')

    // The session really is gone, not just the local UI state.
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Authentication Error Cases', () => {
  test('should show error for invalid login credentials', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Username').fill('nonexistentuser')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Login' }).click()

    await expect(page.locator('.v-alert')).toContainText(/Account not found|Invalid credentials/)
  })

  test('should show error for duplicate username registration', async ({ page }) => {
    const username = await registerUser(page)

    await page.goto('/register')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password', { exact: true }).fill('AnotherPassword123!')
    await page.getByLabel('Confirm Password').fill('AnotherPassword123!')
    await page.getByRole('button', { name: 'Register', exact: true }).click()

    await expect(page.locator('.v-alert')).toContainText('already taken')
  })

  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/account')

    await expect(page).toHaveURL(/\/login/)
  })
})
