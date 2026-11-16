import { test, expect, type Page } from '@playwright/test'
import postgres from 'postgres'
const reel = (page: Page) => page.getByRole('list', { name: 'Missing films' })
const rows = (page: Page) => reel(page).getByRole('listitem')
// Radix Select renders a combobox button and a listbox, not a native <select>.
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:43211/control', { data: { mode: '' } })
  // Each test starts with no search history in the throwaway e2e database
  // (bun run test:e2e provides DATABASE_URL).
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    onnotice: () => {}
  })
  try {
    await sql`DELETE FROM search_request`
  } finally {
    await sql.end()
  }
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
    headers: { Origin: 'http://localhost:43210' },
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
      ['GET', '/api/status'],
      ['GET', '/api/poster/1'],
      ['POST', '/api/search']
    ] as const) {
      const response = await context.request.fetch(path, {
        method,
        headers: { Origin: 'http://localhost:43210' },
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

test('shows each film’s search and download progress, and keeps it after a refresh', async ({
  page,
  request
}, info) => {
  const progress = (body: object) =>
    request.post('http://127.0.0.1:43211/control', { data: { progress: body } })
  await page.goto('/')
  await page.getByLabel('Select Doodlebug', { exact: true }).check()
  await page.getByRole('button', { name: 'Search selected in Radarr' }).click()
  await page
    .getByRole('button', { name: 'Confirm search', exact: true })
    .click()
  const doodlebug = rows(page).filter({ hasText: 'Doodlebug' })
  await expect(doodlebug).toContainText('Searching Radarr…')
  await expect(page.getByText('1 searching or downloading')).toBeVisible()
  // Progress comes from Radarr and the stored ticket, not the page.
  await page.reload()
  await expect(doodlebug).toContainText('Searching Radarr…')
  await progress({
    queue: [
      {
        movieId: 1,
        status: 'downloading',
        trackedDownloadStatus: 'ok',
        trackedDownloadState: 'downloading',
        size: 1000,
        sizeleft: 600,
        timeleft: '00:07:00'
      }
    ]
  })
  await expect(doodlebug).toContainText('Downloading 40%, about 7 min left', {
    timeout: 15000
  })
  await page.screenshot({
    path: info.outputPath('downloading.png'),
    fullPage: true
  })
  // Once Radarr imports it, the film leaves the backlog by itself.
  await progress({ queue: [], commandStatus: 'completed', mode: 'downloaded' })
  await expect(doodlebug).toHaveCount(0, { timeout: 15000 })
})

test('says when a search found nothing and offers to pick the film again', async ({
  page,
  request
}) => {
  await request.post('http://127.0.0.1:43211/control', {
    data: { progress: { commandStatus: 'completed' } }
  })
  await page.goto('/')
  await page
    .getByLabel('Select Meshes of the Afternoon', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Search selected in Radarr' }).click()
  await page
    .getByRole('button', { name: 'Confirm search', exact: true })
    .click()
  const meshes = rows(page).filter({ hasText: 'Meshes of the Afternoon' })
  await expect(meshes).toContainText('No release found when searched')
  await meshes.getByRole('button', { name: 'Pick to search again' }).click()
  await expect(
    page.getByLabel('Select Meshes of the Afternoon', { exact: true })
  ).toBeChecked()
  await expect(page.getByRole('region', { name: 'Your ticket' })).toContainText(
    'ADMIT 1'
  )
})

test('says when progress can’t be checked, without hiding the backlog', async ({
  page,
  request
}) => {
  await request.post('http://127.0.0.1:43211/control', {
    data: { mode: 'queue-failed' }
  })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(3)
  await expect(
    page.getByText(
      'Couldn’t check progress with Radarr: Radarr returned HTTP 500.'
    )
  ).toBeVisible()
  await expect(
    page.getByText('Progress isn’t shown until Radarr answers.')
  ).toBeVisible()
})

test('shows Radarr’s posters on the marquee and the reel, with a plain card when there is none', async ({
  page
}) => {
  await page.goto('/')
  const loaded = (name: string) =>
    expect
      .poll(() =>
        page
          .getByRole('img', { name, exact: true })
          .first()
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)
      )
      .toBeGreaterThan(0)
  // Marquee (500 px) and reel (250 px) copies of Doodlebug's poster.
  await expect(
    page.getByRole('img', { name: 'Poster for Doodlebug', exact: true })
  ).toHaveCount(2)
  await loaded('Poster for Doodlebug')
  await loaded('Poster for Meshes of the Afternoon')
  // Following has no poster in Radarr: a placeholder, not a broken image.
  await expect(
    rows(page).filter({ hasText: 'Following' }).getByRole('img')
  ).toHaveCount(0)
  const response = await page.request.get('/api/poster/1')
  expect(response.headers()['content-type']).toBe('image/jpeg')
  expect(response.headers()['cache-control']).toBe('private, max-age=86400')
  expect((await page.request.get('/api/poster/3')).status()).toBe(404)
  expect((await page.request.get('/api/poster/nope')).status()).toBe(404)
})
