import { test, expect, type Page } from '@playwright/test'
const reel = (page: Page) => page.getByRole('list', { name: 'Missing films' })
const rows = (page: Page) => reel(page).getByRole('listitem')
// Radix Select renders a combobox button and a listbox, not a native <select>.
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:43211/control', { data: { mode: '' } })
})
test('finds the shortest missing films and searches a selected batch', async ({
  page,
  request
}, info) => {
  await page.goto('/')
  const rows = page
    .getByRole('list', { name: 'Missing films' })
    .getByRole('listitem')
  await expect(rows).toHaveCount(3)
  await expect(
    page.getByRole('region', { name: 'Shortest film you are missing' })
  ).toContainText('Doodlebug')
  await expect(rows.nth(0)).toContainText('Doodlebug')
  await expect(rows.nth(1)).toContainText('Meshes of the Afternoon')
  await expect(
    page.getByText('Already Downloaded', { exact: true })
  ).toHaveCount(0)
  await choose(page, 'Length', '20 minutes or less')
  await expect(rows).toHaveCount(2)
  await choose(page, 'Tag', 'Director shorts')
  await expect(page.getByRole('region', { name: 'Your ticket' })).toHaveCount(0)
  await page.getByLabel('Select Doodlebug', { exact: true }).check()
  await expect(
    page.getByRole('button', { name: 'Picked', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  const ticket = page.getByRole('region', { name: 'Your ticket' })
  await expect(ticket).toContainText('SCUDDER PICTURE HOUSE')
  await expect(ticket).toContainText('ADMIT 1')
  await expect(ticket).toContainText('3 MIN')
  await expect(ticket).toContainText('270 ft of 35mm')
  await expect(ticket.getByLabel(/^Serial \d{6}$/)).toHaveCount(2)
  await page.getByRole('button', { name: 'Search selected in Radarr' }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Search for 1 film?' })
  ).toContainText('automatically')
  expect(
    (await (await request.get('http://127.0.0.1:43211/control')).json())
      .commands
  ).toHaveLength(0)
  await page
    .getByRole('button', { name: 'Confirm search', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText(
    'Search accepted for 1 film'
  )
  const control = await (
    await request.get('http://127.0.0.1:43211/control')
  ).json()
  expect(control.commands).toEqual([{ name: 'MoviesSearch', movieIds: [1] }])
  expect(
    control.requests.filter((p: string) => p.endsWith('/movie'))
  ).toHaveLength(2)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  expect(await page.content()).not.toContain('fixture-key')
  await page.screenshot({
    path: info.outputPath('search-accepted.png'),
    fullPage: true
  })
})
test('separates unknown runtimes and filters title, availability and monitoring', async ({
  page
}, info) => {
  await page.goto('/')
  await expect(rows(page)).toHaveCount(3)
  await page
    .getByRole('button', { name: 'Unknown runtime (1)', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Unknown runtime (1)', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Known runtime', exact: true })
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(rows(page)).toHaveCount(1)
  await expect(reel(page)).toContainText('Unknown Length')
  await expect(
    page.getByRole('combobox', { name: 'Length', exact: true })
  ).toBeDisabled()
  await page.screenshot({
    path: info.outputPath('unknown-runtime.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: 'All missing', exact: true }).click()
  await page.getByLabel('Monitored only').uncheck()
  await page.getByLabel('Available according to Radarr').uncheck()
  await expect(rows(page)).toHaveCount(6)
  await choose(page, 'Sort by', 'Longest first')
  await expect(rows(page).first()).toContainText('Following')
  await expect(rows(page).last()).toContainText('Unknown Length')
  await page.getByLabel('Find a film').fill('nothing matches')
  await expect(
    page.getByRole('heading', { name: 'No films match these filters' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Show all missing films' }).click()
  await expect(rows(page)).toHaveCount(6)
})
test('shows connection failures and recovers on refresh', async ({
  page,
  request
}, info) => {
  await request.post('http://127.0.0.1:43211/control', {
    data: { mode: 'unauthorized' }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    'Radarr rejected the API key'
  )
  await page.screenshot({
    path: info.outputPath('connection-error.png'),
    fullPage: true
  })
  await request.post('http://127.0.0.1:43211/control', { data: { mode: '' } })
  await page.getByRole('button', { name: 'Refresh library' }).click()
  await expect(rows(page)).toHaveCount(3)
})
test('rejects stale selections and reports failed searches without success', async ({
  page,
  request
}, info) => {
  await page.goto('/')
  await page.getByLabel('Select Doodlebug', { exact: true }).check()
  await request.post('http://127.0.0.1:43211/control', {
    data: { mode: 'downloaded' }
  })
  await page.getByRole('button', { name: 'Search selected in Radarr' }).click()
  await page
    .getByRole('button', { name: 'Confirm search', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('no longer missing')
  expect(
    (await (await request.get('http://127.0.0.1:43211/control')).json())
      .commands
  ).toHaveLength(0)
  await request.post('http://127.0.0.1:43211/control', {
    data: { mode: 'search-failed' }
  })
  await page.getByRole('button', { name: 'Search selected in Radarr' }).click()
  await page
    .getByRole('button', { name: 'Confirm search', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('HTTP 500')
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.screenshot({
    path: info.outputPath('search-error.png'),
    fullPage: true
  })
})
test('rejects cross-origin and invalid search submissions', async ({
  request
}) => {
  const cross = await request.post('/api/search', {
    headers: { Origin: 'https://other.example' },
    data: { movieIds: [1] }
  })
  expect(cross.status()).toBe(403)
  const invalid = await request.post('/api/search', {
    headers: { Origin: 'http://127.0.0.1:43210' },
    data: { movieIds: [] }
  })
  expect(invalid.status()).toBe(400)
})

test('signed-out visitors are sent to sign-in and the API refuses them', async ({
  browser
}) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] }
  })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page).toHaveURL(/\/auth\/sign-in\?redirectTo=%2F/)
    await expect(page.getByText('Sign in to Sortarr')).toBeVisible()
    for (const [method, path] of [
      ['GET', '/api/library'],
      ['POST', '/api/search']
    ] as const) {
      const response = await context.request.fetch(path, {
        method,
        headers: { Origin: 'http://127.0.0.1:43210' },
        data: method === 'POST' ? { movieIds: [1] } : undefined
      })
      expect(response.status()).toBe(401)
    }
    expect(
      (await (await context.request.get('/api/health')).json()).status
    ).toBe('ok')
  } finally {
    await context.close()
  }
})
