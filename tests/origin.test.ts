import { afterEach, expect, test } from 'bun:test'
import { ApiError, search } from '../server/radarr'
// Cloudflare Tunnel delivers plain HTTP, so the container's request URL never
// matches the browser's https Origin without APP_ORIGIN.
const tunnelled = (origin: string) =>
  new Request('http://sortarr.thescudders.org/api/search', {
    method: 'POST',
    headers: { Origin: origin },
    body: '{}'
  })
const status = (request: Request) =>
  search(request).then(
    () => 200,
    (error: ApiError) => error.status
  )
afterEach(() => {
  delete process.env.APP_ORIGIN
})
test('APP_ORIGIN accepts the public https origin behind the tunnel', async () => {
  process.env.APP_ORIGIN = 'https://sortarr.thescudders.org/'
  // 400 is the empty-selection error, reached only after the origin check passes.
  expect(await status(tunnelled('https://sortarr.thescudders.org'))).toBe(400)
  expect(await status(tunnelled('https://evil.example'))).toBe(403)
})
test('without APP_ORIGIN the request origin must match exactly', async () => {
  expect(await status(tunnelled('https://sortarr.thescudders.org'))).toBe(403)
  expect(await status(tunnelled('http://sortarr.thescudders.org'))).toBe(400)
})
