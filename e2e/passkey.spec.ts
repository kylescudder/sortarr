import { test, expect, type Page } from '@playwright/test'

// The steps type the throwaway member's password, so keep them out of traces.
test.use({ trace: 'off' })

// Chromium's virtual authenticator stands in for Touch ID or a phone: it
// holds a discoverable credential and approves user verification. While
// presence is simulated it also answers the sign-in page's passkey autofill
// at once, which a real person would have to pick, so the test can pause it.
async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true
      }
    }
  )
  return {
    credentials: async () =>
      (await cdp.send('WebAuthn.getCredentials', { authenticatorId }))
        .credentials,
    present: (enabled: boolean) =>
      cdp.send('WebAuthn.setAutomaticPresenceSimulation', {
        authenticatorId,
        enabled
      })
  }
}

test('a member adds a passkey, signs out and signs back in with it', async ({
  browser
}, info) => {
  // A fresh session of its own, so signing out leaves the shared one intact,
  // and a client address of its own for the sign-in rate limit.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: {
      'cf-connecting-ip':
        info.project.name === 'mobile' ? '192.0.2.12' : '192.0.2.11'
    }
  })
  const sessionCookies = async () =>
    (await context.cookies())
      .map((c) => c.name)
      .filter((name) => name.includes('session_token'))
  const name = `E2E ${info.project.name} passkey`
  try {
    const page = await context.newPage()
    const authenticator = await addVirtualAuthenticator(page)

    await page.goto('/auth/sign-in?redirectTo=%2Fprofile')
    await page.locator('#email').fill(process.env.E2E_USERNAME!)
    await page.locator('#password').fill(process.env.E2E_PASSWORD!)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText('No passkeys')).toBeVisible()

    await page.getByRole('button', { name: 'Add passkey' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByRole('button', { name: 'Add passkey' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText(name, { exact: true })).toBeVisible()
    await expect(page.getByText('No passkeys')).toHaveCount(0)
    expect(await authenticator.credentials()).toHaveLength(1)
    await info.attach('passkey added', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    })

    // Signing out ends the session in the browser and on the server.
    await authenticator.present(false)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/auth\/sign-in\?redirectTo=%2F$/)
    expect(await sessionCookies()).toEqual([])
    const refused = await context.request.get('/api/library')
    expect(refused.status()).toBe(401)
    await expect(page.getByText('Sign in to Sortarr')).toBeVisible()

    // No email or password: the passkey alone signs the member back in.
    await authenticator.present(true)
    await page.getByRole('button', { name: 'Continue with Passkey' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole('list', { name: 'Missing films' })
    ).toBeVisible()
    expect(await sessionCookies()).not.toEqual([])
    expect((await context.request.get('/api/library')).status()).toBe(200)
    await info.attach('signed in with passkey', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })

    // Removing it leaves the account as it was, for the other project's run.
    await page.goto('/profile')
    await page.getByRole('button', { name: `Delete passkey ${name}` }).click()
    const confirm = page.getByRole('alertdialog')
    await confirm.getByRole('button', { name: 'Delete passkey' }).click()
    await expect(confirm).toHaveCount(0)
    await expect(page.getByText('No passkeys')).toBeVisible()
  } finally {
    await context.close()
  }
})
