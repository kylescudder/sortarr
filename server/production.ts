import path from 'node:path'
const root = path.resolve('dist/client')
const app = (await import(path.resolve('dist/server/server.js'))).default as {
  fetch(request: Request): Promise<Response>
}
const server = Bun.serve({
  hostname: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3210),
  maxRequestBodySize: 8192,
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
              'X-Content-Type-Options': 'nosniff'
            }
          })
      }
    }
    const response = await app.fetch(request)
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'same-origin')
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
})
console.log(`Sortarr ready at ${server.url}`)
process.once('SIGTERM', () => {
  void server.stop()
})
