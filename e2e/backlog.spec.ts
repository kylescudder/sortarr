import { test, expect, type Page } from '@playwright/test'
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
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Doodlebug')
  await expect(rows.nth(1)).toContainText('Meshes of the Afternoon')
  await expect(
    page.getByText('Already Downloaded', { exact: true })
  ).toHaveCount(0)
  await choose(page, 'Length', '20 minutes or less')
  await expect(rows).toHaveCount(2)
  await choose(page, 'Tag', 'Director shorts')
  await page.getByLabel('Select Doodlebug', { exact: true }).check()
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
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page
    .getByRole('button', { name: 'Unknown runtime (1)', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Unknown runtime (1)', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Known runtime', exact: true })
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody')).toContainText('Unknown Length')
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
  await expect(page.locator('tbody tr')).toHaveCount(6)
  await choose(page, 'Sort by', 'Longest first')
  await expect(page.locator('tbody tr').first()).toContainText('Following')
  await expect(page.locator('tbody tr').last()).toContainText('Unknown Length')
  await page.getByLabel('Find a film').fill('nothing matches')
  await expect(
    page.getByRole('heading', { name: 'No films match these filters' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Show all missing films' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(6)
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
  await expect(page.locator('tbody tr')).toHaveCount(3)
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
