import { test, expect } from '@playwright/test'

// The sign-in steps type the throwaway member's password, so keep them out of
// traces. The final screenshot is taken after the form has gone.
test.use({ trace: 'off' })

test('a member signs in with their password after a wrong one is refused', async ({
  browser
}, info) => {
  // Signed out, with a client address of its own (Cloudflare sets this header
  // in production) so each project gets its own sign-in rate-limit budget.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: {
      'cf-connecting-ip':
        info.project.name === 'mobile' ? '192.0.2.2' : '192.0.2.1'
    }
  })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page).toHaveURL(/\/auth\/sign-in\?redirectTo=%2F/)
    await expect(page.getByText('Sign in to Sortarr')).toBeVisible()

    // The eye button reveals and hides the password, and shows its icon.
    const password = page.locator('#password')
    await expect(password).toHaveAttribute('type', 'password')
    const show = page.getByRole('button', { name: 'Show password' })
    await expect(show.locator('svg')).toBeVisible()
    await show.click()
    await expect(password).toHaveAttribute('type', 'text')
    const hide = page.getByRole('button', { name: 'Hide password' })
    await expect(hide.locator('svg')).toBeVisible()
    await hide.click()
    await expect(password).toHaveAttribute('type', 'password')

    const signIn = page.getByRole('button', { name: 'Sign In', exact: true })
    await page.locator('#email').fill(process.env.E2E_USERNAME!)
    await password.fill('not-the-password-' + info.project.name)
    await signIn.click()
    await expect(page.getByText('Invalid email or password')).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/sign-in/)
    expect((await context.cookies()).map((c) => c.name)).not.toContainEqual(
      expect.stringContaining('session_token')
    )

    await password.fill(process.env.E2E_PASSWORD!)
    await signIn.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole('list', { name: 'Missing films' })
    ).toBeVisible()
    await expect(page.getByText('Sign in to Sortarr')).toHaveCount(0)

    await info.attach('signed in', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  } finally {
    await context.close()
  }
})
