const movies = [
  {
    id: 1,
    title: 'Doodlebug',
    year: 1997,
    runtime: 3,
    hasFile: false,
    monitored: true,
    isAvailable: true,
    tags: [1],
    genres: ['Thriller'],
    overview: 'An early short film about a man chasing an elusive creature.',
    status: 'released'
  },
  {
    id: 2,
    title: 'Meshes of the Afternoon',
    year: 1943,
    runtime: 14,
    hasFile: false,
    monitored: true,
    isAvailable: true,
    tags: [1],
    genres: ['Experimental'],
    overview: 'A dreamlike journey through familiar rooms.',
    status: 'released'
  },
  {
    id: 3,
    title: 'Following',
    year: 1998,
    runtime: 69,
    hasFile: false,
    monitored: true,
    isAvailable: true,
    tags: [],
    genres: ['Thriller'],
    overview: 'A writer follows strangers through London.',
    status: 'released'
  },
  {
    id: 4,
    title: 'Unknown Length',
    year: 2000,
    runtime: 0,
    hasFile: false,
    monitored: true,
    isAvailable: true,
    tags: [],
    genres: [],
    overview: '',
    status: 'released'
  },
  {
    id: 5,
    title: 'Already Downloaded',
    year: 2001,
    runtime: 1,
    hasFile: true,
    monitored: true,
    isAvailable: true,
    tags: [],
    genres: [],
    overview: '',
    status: 'released'
  },
  {
    id: 6,
    title: 'Unmonitored Short',
    year: 1990,
    runtime: 6,
    hasFile: false,
    monitored: false,
    isAvailable: true,
    tags: [],
    genres: [],
    overview: '',
    status: 'released'
  },
  {
    id: 7,
    title: 'Unreleased Short',
    year: 2030,
    runtime: 4,
    hasFile: false,
    monitored: true,
    isAvailable: false,
    tags: [],
    genres: [],
    overview: '',
    status: 'announced'
  }
]
let mode = ''
let commands: unknown[] = []
let requests: string[] = []
// Search progress: what Radarr reports for command 42, its queue and history.
let commandStatus = 'started'
let queue: unknown[] = []
let grabs: unknown[] = []
const mock = Bun.serve({
  hostname: '127.0.0.1',
  port: 43211,
  async fetch(request) {
    const pathname = new URL(request.url).pathname
    if (pathname === '/control' && request.method === 'POST') {
      const control = await request.json()
      if ('progress' in control) {
        // Change only Radarr's progress, keeping the rest of the fixture.
        commandStatus = control.progress.commandStatus ?? commandStatus
        queue = control.progress.queue ?? queue
        grabs = control.progress.grabs ?? grabs
        if (control.progress.mode !== undefined) mode = control.progress.mode
        return Response.json({ ok: true })
      }
      mode = control.mode || ''
      commands = []
      requests = []
      commandStatus = 'started'
      queue = []
      grabs = []
      return Response.json({ ok: true })
    }
    if (pathname === '/control') return Response.json({ commands, requests })
    if (request.headers.get('X-Api-Key') !== 'fixture-key')
      return new Response(null, { status: 401 })
    requests.push(pathname)
    if (mode === 'unauthorized') return new Response(null, { status: 401 })
    if (pathname === '/radarr/api/v3/movie')
      return Response.json(
        movies.map((m) =>
          mode === 'downloaded' && m.id === 1 ? { ...m, hasFile: true } : m
        )
      )
    if (pathname === '/radarr/api/v3/tag')
      return Response.json([{ id: 1, label: 'Director shorts' }])
    if (pathname === '/radarr/api/v3/command') {
      if (mode === 'search-failed') return new Response(null, { status: 500 })
      commands.push(await request.json())
      return Response.json({ id: 42, status: 'queued' }, { status: 201 })
    }
    if (pathname === '/radarr/api/v3/command/42')
      return Response.json({ id: 42, status: commandStatus })
    if (pathname === '/radarr/api/v3/queue')
      return Response.json({ records: queue })
    if (pathname === '/radarr/api/v3/history/since') return Response.json(grabs)
    return new Response(null, { status: 404 })
  }
})
const child = Bun.spawn(['bun', 'server/production.ts'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '43210',
    APP_ORIGIN: 'http://127.0.0.1:43210',
    BETTER_AUTH_URL: 'http://127.0.0.1:43210',
    RADARR_URL: 'http://127.0.0.1:43211/radarr',
    RADARR_API_KEY: 'fixture-key'
  },
  stdout: 'inherit',
  stderr: 'inherit'
})
process.on('SIGTERM', () => {
  child.kill()
  void mock.stop()
  process.exit(0)
})
process.on('SIGINT', () => {
  child.kill()
  void mock.stop()
  process.exit(0)
})
await child.exited
await mock.stop()

export {}
