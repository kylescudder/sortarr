import path from 'node:path'
import { revision } from './revision'
import { readEnv } from '../src/server/env'

// Fail fast on missing auth or database settings. The error names the
// settings, never their values.
try {
  readEnv()
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid settings')
  process.exit(1)
}
const root = path.resolve('dist/client')
const app = (await import(path.resolve('dist/server/server.js'))).default as {
  fetch(request: Request): Promise<Response>
}
const server = Bun.serve({
  hostname: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3210),
  // Above the profile photo's own 2 MB limit (enforced, with a JSON error, in
  // src/server/profile-handler.ts). Every other route takes small JSON bodies
  // and validates them; a lower cap here cut photo uploads off with an empty
  // 413 that browsers couldn't read.
  maxRequestBodySize: 3 * 1024 * 1024,
  async fetch(request) {
    const url = new URL(request.url)
    if (['GET', 'HEAD'].includes(request.method)) {
      let filename: string
      try {
        filename = path.resolve(root, `.${decodeURIComponent(url.pathname)}`)
      } catch {
        return new Response('Bad path', { status: 400 })
      }
      if (filename.startsWith(`${root}${path.sep}`)) {
        const file = Bun.file(filename)
        if (await file.exists())
          return new Response(request.method === 'HEAD' ? null : file, {
            headers: {
              'Content-Type': file.type,
              'X-Content-Type-Options': 'nosniff',
              'X-Sortarr-Revision': revision(),
              // Vite fingerprints everything under /assets.
              'Cache-Control': url.pathname.startsWith('/assets/')
                ? 'public, max-age=31536000, immutable'
                : 'no-cache'
            }
          })
      }
    }
    const response = await app.fetch(request)
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'same-origin')
    // Routes may opt into caching (posters); everything else is no-store.
    if (!response.headers.has('Cache-Control'))
      response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Sortarr-Revision', revision())
    return response
  }
})
console.log(`Sortarr ready at ${server.url}`)
process.once('SIGTERM', () => {
  void server.stop()
})
