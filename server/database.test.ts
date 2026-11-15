// Runs only against an explicitly supplied disposable PostgreSQL service.
import assert from 'node:assert/strict'
import { afterAll, beforeAll, beforeEach, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import sharp from 'sharp'
import { virtualAuthenticator } from './webauthn-fixture'

if (!process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL must point to disposable PostgreSQL')
const admin = postgres(process.env.TEST_DATABASE_URL, {
  max: 1,
  onnotice: () => {}
})
// Mirrors production: an owner role that owns the database and runs
// migrations, and a runtime role limited to row access on tables in public.
const name = 'sortarr_ci_' + randomUUID().replaceAll('-', '').slice(0, 10)
const ownerName = name + '_owner'
const runtimeName = name + '_runtime'
const otherName = name + '_other'
const clients: ReturnType<typeof postgres>[] = []
const created: string[] = []

function client(user: string, database = name) {
  const url = new URL(process.env.TEST_DATABASE_URL!)
  url.username = user
  url.password = ''
  url.pathname = '/' + database
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
  clients.push(sql)
  return sql
}

async function denied(operation: PromiseLike<unknown>) {
  await assert.rejects(Promise.resolve(operation), (error: unknown) => {
    return (error as { code?: string }).code === '42501'
  })
}

function migrate() {
  // The same Bun binary as the test run, through the real migration entrypoint.
  return Bun.spawn(
    [process.execPath, new URL('./migrate.ts', import.meta.url).pathname],
    {
      env: { ...process.env, DATABASE_URL: ownerUrl.toString() },
      stdout: 'ignore',
      stderr: 'inherit'
    }
  ).exited
}

type RouteHandler = (context: { request: Request }) => Promise<Response>
// The real TanStack Start file-route handlers, without building the app.
function serverHandlers(route: unknown) {
  return (
    route as { options: { server: { handlers: Record<string, RouteHandler> } } }
  ).options.server.handlers
}

let owner: ReturnType<typeof postgres>
let runtime: ReturnType<typeof postgres>
let ownerUrl: URL
let applicationSql: ReturnType<typeof postgres>
let application: { fetch(request: Request): Promise<Response> }
// A local stand-in for Radarr; nothing real is contacted.
let radarr: ReturnType<typeof Bun.serve> | undefined
const radarrRequests: string[] = []
const radarrKey = 'fixture-radarr-key'
// Mutable stub state for the search-progress test; everything else sees an
// empty library and queue.
const stub = {
  movies: [] as object[],
  commandStatus: 'queued',
  queue: [] as object[],
  grabs: [] as object[],
  grabOnSearch: false
}
const authOrigin = 'https://sortarr.auth.test'
const allowedEmails = ['member@example.com', 'second@example.com']
const originalEnv = Object.fromEntries(
  [
    'DATABASE_URL',
    'APP_ORIGIN',
    'BETTER_AUTH_URL',
    'BETTER_AUTH_SECRET',
    'BREVO_API_KEY',
    'AUTH_EMAIL_FROM',
    'AUTH_ALLOWED_EMAILS',
    'RADARR_URL',
    'RADARR_API_KEY'
  ].map((key) => [key, process.env[key]])
)

beforeAll(async () => {
  for (const role of [ownerName, runtimeName]) {
    await admin.unsafe(
      `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`
    )
    created.push(role)
  }
  for (const database of [name, otherName]) {
    await admin.unsafe(`CREATE DATABASE "${database}" OWNER "${ownerName}"`)
    created.push(database)
    await admin.unsafe(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`)
  }
  await admin.unsafe(`GRANT CONNECT ON DATABASE "${name}" TO "${runtimeName}"`)
  owner = client(ownerName)
  await owner.unsafe(`
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO "${runtimeName}";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${runtimeName}";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${runtimeName}";
  `)
  ownerUrl = new URL(process.env.TEST_DATABASE_URL!)
  ownerUrl.username = ownerName
  ownerUrl.password = ''
  ownerUrl.pathname = '/' + name
  // Create the fixture through the real migration entrypoint. The test reruns it.
  assert.equal(await migrate(), 0, 'Migration failed')
  runtime = client(runtimeName)
  radarr = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url)
      radarrRequests.push(pathname)
      if (request.headers.get('x-api-key') !== radarrKey)
        return new Response(null, { status: 401 })
      if (pathname === '/api/v3/movie') return Response.json(stub.movies)
      if (pathname === '/api/v3/tag') return Response.json([])
      if (pathname === '/api/v3/command' && request.method === 'POST') {
        // Radarr can grab a release within the same moment it accepts a search.
        if (stub.grabOnSearch) {
          stub.grabs = [{ movieId: 501, date: new Date().toISOString() }]
          // Answering takes a moment, as with a real Radarr, so the ticket
          // is only stored after the grab.
          return Bun.sleep(25).then(() =>
            Response.json({ id: 9001, status: 'queued' }, { status: 201 })
          )
        }
        return Response.json({ id: 9001, status: 'queued' }, { status: 201 })
      }
      if (pathname === '/api/v3/command/9001')
        return Response.json({ id: 9001, status: stub.commandStatus })
      if (pathname === '/api/v3/queue')
        return Response.json({ records: stub.queue })
      if (pathname === '/api/v3/history/since') return Response.json(stub.grabs)
      return new Response('Not found', { status: 404 })
    }
  })
  const applicationUrl = new URL(process.env.TEST_DATABASE_URL!)
  applicationUrl.username = runtimeName
  applicationUrl.password = ''
  applicationUrl.pathname = '/' + name
  process.env.DATABASE_URL = applicationUrl.toString()
  process.env.APP_ORIGIN = authOrigin
  process.env.BETTER_AUTH_URL = authOrigin
  process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID()
  process.env.BREVO_API_KEY = 'fixture-never-used-to-send'
  process.env.AUTH_EMAIL_FROM = 'sortarr@example.com'
  process.env.AUTH_ALLOWED_EMAILS = allowedEmails.join(',')
  process.env.RADARR_URL = radarr.url.href
  process.env.RADARR_API_KEY = radarrKey
  const { sql } = await import('../src/server/db')
  applicationSql = sql
  clients.push(applicationSql)
  const routes: Record<string, unknown> = {
    '/api/auth': (await import('../src/routes/api.auth.$')).Route,
    '/api/profile': (await import('../src/routes/api.profile')).Route,
    '/api/profile/avatar': (await import('../src/routes/api.profile.avatar'))
      .Route,
    '/api/library': (await import('../src/routes/api/library')).Route,
    '/api/search': (await import('../src/routes/api/search')).Route,
    '/api/status': (await import('../src/routes/api/status')).Route,
    '/api/health': (await import('../src/routes/api/health')).Route
  }
  application = {
    async fetch(request) {
      const { pathname } = new URL(request.url)
      const route = pathname.startsWith('/api/auth/')
        ? routes['/api/auth']
        : routes[pathname]
      const handler = route ? serverHandlers(route)[request.method] : undefined
      if (!handler) return new Response('Not found', { status: 404 })
      return handler({ request })
    }
  }
})

beforeEach(async () => {
  // Better Auth's per-IP limits are shared by every case in this database.
  await owner`DELETE FROM auth_rate_limit`
})

afterAll(async () => {
  await radarr?.stop(true)
  await Promise.all(clients.map((sql) => sql.end({ timeout: 1 })))
  for (const database of [otherName, name]) {
    if (created.includes(database))
      await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`)
  }
  for (const role of [runtimeName, ownerName]) {
    if (created.includes(role)) await admin.unsafe(`DROP ROLE "${role}"`)
  }
  await admin.end({ timeout: 1 })
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const getLibrary = (cookie = '') =>
  application.fetch(
    new Request(authOrigin + '/api/library', { headers: { Cookie: cookie } })
  )
const getStatus = (cookie = '') =>
  application.fetch(
    new Request(authOrigin + '/api/status', { headers: { Cookie: cookie } })
  )
const postSearch = (
  cookie = '',
  body: unknown = { movieIds: [1] },
  origin = authOrigin
) =>
  application.fetch(
    new Request(authOrigin + '/api/search', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: origin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  )

test('owner migrations are repeatable and preserve their journal', async () => {
  assert.equal(await migrate(), 0, 'Migration failed')
  const [journal] =
    await owner`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`
  assert.equal(journal.applied, 2)
})

test('restricted runtime supports CRUD on the auth tables while DDL, journals and other databases are denied', async () => {
  const tables = await owner`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  assert.deepEqual(
    tables.map(({ tablename }) => tablename),
    [
      'auth_account',
      'auth_email_limit',
      'auth_passkey',
      'auth_rate_limit',
      'auth_session',
      'auth_user',
      'auth_verification',
      'search_request',
      'user_profile'
    ]
  )
  // Default privileges give the runtime row access, and nothing more, on
  // every table the owner's migrations create.
  const grants = await owner`
    SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
    FROM information_schema.role_table_grants
    WHERE grantee = ${runtimeName}
    GROUP BY table_name ORDER BY table_name`
  assert.deepEqual(
    grants.map(({ table_name, privileges }) => [table_name, privileges]),
    tables.map(({ tablename }) => [tablename, 'DELETE,INSERT,SELECT,UPDATE'])
  )
  const id = 'runtime-' + randomUUID()
  await runtime`
    INSERT INTO auth_user(id, name, email, email_verified)
    VALUES (${id}, 'CI check', ${id + '@example.com'}, true)`
  await runtime`
    INSERT INTO auth_session(id, expires_at, token, user_id)
    VALUES (${id}, now() + interval '1 hour', ${id}, ${id})`
  await runtime`
    INSERT INTO user_profile(user_id, avatar, avatar_version)
    VALUES (${id}, ${Buffer.from([1, 2, 3])}, 'v1')`
  await runtime`UPDATE auth_user SET name = 'Updated' WHERE id = ${id}`
  await runtime`UPDATE user_profile SET avatar = NULL WHERE user_id = ${id}`
  const [updated] = await runtime`
    SELECT u.name, p.avatar FROM auth_user u
    JOIN user_profile p ON p.user_id = u.id WHERE u.id = ${id}`
  assert.equal(updated.name, 'Updated')
  assert.equal(updated.avatar, null)
  await runtime`DELETE FROM auth_user WHERE id = ${id}`
  // Deleting a user cascades to its sessions and profile.
  assert.equal(
    (await runtime`SELECT id FROM auth_session WHERE user_id = ${id}`).length,
    0
  )
  assert.equal(
    (await runtime`SELECT user_id FROM user_profile WHERE user_id = ${id}`)
      .length,
    0
  )
  await denied(runtime.unsafe('CREATE TABLE public.forbidden(id int)'))
  await denied(runtime.unsafe('CREATE TEMPORARY TABLE forbidden(id int)'))
  await denied(runtime.unsafe('CREATE SCHEMA forbidden'))
  await denied(runtime.unsafe('CREATE ROLE forbidden'))
  await denied(runtime.unsafe('ALTER TABLE auth_user ADD COLUMN role text'))
  await denied(runtime.unsafe('DROP TABLE user_profile'))
  await denied(runtime.unsafe('TRUNCATE auth_session'))
  await denied(runtime`SELECT hash FROM drizzle.__drizzle_migrations`)
  await denied(runtime.unsafe('CREATE TABLE drizzle.forbidden(id int)'))
  const foreign = client(runtimeName, otherName)
  await denied(foreign`SELECT 1`)
})

test('Radarr routes accept a verified member and refuse anyone else before contacting Radarr', async () => {
  const before = radarrRequests.length
  // No session, and a forged session cookie, are refused before Radarr.
  for (const cookie of ['', 'sortarr-auth.session_token=forged']) {
    const library = await getLibrary(cookie)
    assert.equal(library.status, 401)
    assert.equal(library.headers.get('Cache-Control'), 'no-store')
    assert.deepEqual(await library.json(), {
      error: 'Sign in to use Sortarr.'
    })
    assert.equal((await postSearch(cookie)).status, 401)
  }
  assert.equal(radarrRequests.length, before, 'Radarr was contacted')
  const fixture = await authFixture()
  const { cookie } = await signInFixture(fixture)
  const library = await getLibrary(cookie)
  assert.equal(library.status, 200, await library.clone().text())
  const body = await library.json()
  assert.deepEqual(
    { movies: body.movies, tags: body.tags },
    { movies: [], tags: [] }
  )
  assert.deepEqual(radarrRequests.slice(before).sort(), [
    '/api/v3/movie',
    '/api/v3/tag'
  ])
  // A member's search still needs this site's origin and a valid selection.
  assert.equal(
    (await postSearch(cookie, { movieIds: [1] }, 'https://evil.example'))
      .status,
    403
  )
  assert.equal((await postSearch(cookie, { movieIds: [] })).status, 400)
  // The stub has no missing films, so this passes authorization and then
  // refuses to search a film that is no longer missing.
  assert.equal((await postSearch(cookie)).status, 409)
})

test('searches are recorded for the member and their progress is reported from Radarr', async () => {
  const contacted = radarrRequests.length
  assert.equal((await getStatus('')).status, 401)
  assert.equal(
    (await getStatus('sortarr-auth.session_token=forged')).status,
    401
  )
  assert.equal(radarrRequests.length, contacted, 'Radarr was contacted')
  stub.movies = [
    {
      id: 501,
      title: 'Doodlebug',
      year: 1997,
      runtime: 3,
      hasFile: false,
      monitored: true,
      isAvailable: true,
      tags: [],
      genres: [],
      overview: '',
      status: 'released'
    }
  ]
  stub.commandStatus = 'started'
  try {
    const fixture = await authFixture()
    const { cookie, user } = await signInFixture(fixture)
    const searched = await postSearch(cookie, { movieIds: [501] })
    assert.equal(searched.status, 200, await searched.clone().text())
    assert.deepEqual(await searched.json(), {
      commandId: 9001,
      status: 'queued',
      count: 1
    })
    const rows = await owner`
      SELECT user_id, command_id, movie_ids FROM search_request`
    assert.deepEqual(
      rows.map((r) => [r.user_id, r.command_id, r.movie_ids]),
      [[user.id, 9001, [501]]]
    )
    const statusOf = async () => {
      const response = await getStatus(cookie)
      assert.equal(response.status, 200, await response.clone().text())
      assert.equal(response.headers.get('Cache-Control'), 'no-store')
      return (await response.json()).statuses['501']
    }
    assert.equal((await statusOf()).state, 'searching')
    stub.queue = [
      {
        movieId: 501,
        status: 'downloading',
        trackedDownloadStatus: 'ok',
        trackedDownloadState: 'downloading',
        size: 1000,
        sizeleft: 250,
        timeleft: '00:04:00'
      }
    ]
    assert.deepEqual(await statusOf(), {
      state: 'downloading',
      progress: 0.75,
      minutesLeft: 4,
      note: null
    })
    stub.queue = []
    stub.commandStatus = 'completed'
    assert.equal((await statusOf()).state, 'not-found')
    stub.grabs = [{ movieId: 501, date: new Date().toISOString() }]
    assert.equal((await statusOf()).state, 'grabbed')
    // Removing the member removes their tickets with them.
    await owner`DELETE FROM auth_user WHERE id = ${user.id}`
    assert.equal(
      (await owner`SELECT count(*)::int AS n FROM search_request`)[0].n,
      0
    )
  } finally {
    Object.assign(stub, {
      movies: [],
      commandStatus: 'queued',
      queue: [],
      grabs: [],
      grabOnSearch: false
    })
    await owner`DELETE FROM search_request`
  }
})

test('a release Radarr grabs while the search is being submitted still counts', async () => {
  stub.movies = [
    {
      id: 501,
      title: 'Doodlebug',
      year: 1997,
      runtime: 3,
      hasFile: false,
      monitored: true,
      isAvailable: true,
      tags: [],
      genres: [],
      overview: '',
      status: 'released'
    }
  ]
  stub.grabOnSearch = true
  stub.commandStatus = 'completed'
  try {
    const fixture = await authFixture()
    const { cookie } = await signInFixture(fixture)
    assert.equal((await postSearch(cookie, { movieIds: [501] })).status, 200)
    const response = await getStatus(cookie)
    assert.equal(response.status, 200, await response.clone().text())
    // The download has already left the queue: it must read as grabbed, not
    // "No release found".
    assert.equal((await response.json()).statuses['501'].state, 'grabbed')
  } finally {
    Object.assign(stub, {
      movies: [],
      commandStatus: 'queued',
      queue: [],
      grabs: [],
      grabOnSearch: false
    })
    await owner`DELETE FROM search_request`
  }
})

test('application pool reuses connections, retires idle backends and reconnects', async () => {
  const [first] = await applicationSql`SELECT pg_backend_pid() AS pid`
  const [reused] = await applicationSql`SELECT pg_backend_pid() AS pid`
  assert.equal(reused.pid, first.pid)

  // Observe PostgreSQL without issuing app queries that reset its idle timer.
  const deadline = Date.now() + 25000
  let connected = true
  while (connected && Date.now() < deadline) {
    const [activity] = await admin`
      SELECT count(*)::int AS connections FROM pg_stat_activity
      WHERE datname = ${name} AND usename = ${runtimeName} AND pid = ${first.pid}
    `
    connected = activity.connections > 0
    if (connected) await Bun.sleep(250)
  }
  assert.equal(connected, false, 'Idle application connection was not retired')

  const [reconnected] = await applicationSql`SELECT pg_backend_pid() AS pid`
  assert.notEqual(reconnected.pid, first.pid)
}, 30000)

let fixtureNumber = 0
async function authFixture(dailyEmailLimit = 40, failMail = false) {
  await owner`DELETE FROM auth_user`
  await owner`DELETE FROM auth_verification`
  await owner`DELETE FROM auth_rate_limit`
  await owner`DELETE FROM auth_email_limit`
  const { db } = await import('../src/server/db')
  const { createSortarrAuth } = await import('../src/server/auth-factory')
  const sent = new Map<string, string>()
  const links: { email: string; kind: string; url: string }[] = []
  const settings = {
    baseURL: authOrigin,
    secret: process.env.BETTER_AUTH_SECRET!,
    allowedEmails,
    dailyEmailLimit
  }
  const auth = createSortarrAuth(
    db,
    settings,
    async (email, otp) => {
      if (failMail) throw new Error('Simulated mail outage')
      sent.set(email, otp)
    },
    async (email, kind, url) => {
      if (failMail) throw new Error('Simulated mail outage')
      links.push({ email, kind, url })
    }
  )
  const ip = `203.0.113.${++fixtureNumber}`
  function request(
    path: string,
    body?: unknown,
    cookie = '',
    extra: Record<string, string> = {}
  ) {
    return auth.handler(
      new Request(authOrigin + '/api/auth' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: authOrigin,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': ip,
          Cookie: cookie,
          ...extra
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    )
  }
  return { auth, request, sent, links, settings, db }
}

function mergeCookies(response: Response, prior = '') {
  const values = new Map(
    prior
      .split('; ')
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        return [part.slice(0, index), part.slice(index + 1)]
      })
  )
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';')[0]
    const index = pair.indexOf('=')
    values.set(pair.slice(0, index), pair.slice(index + 1))
  }
  return [...values].map(([key, value]) => key + '=' + value).join('; ')
}

async function signInFixture(
  fixture: Awaited<ReturnType<typeof authFixture>>,
  email = 'member@example.com'
) {
  const sent = await fixture.request('/email-otp/send-verification-otp', {
    email,
    type: 'sign-in'
  })
  assert.equal(sent.status, 200, await sent.clone().text())
  const response = await fixture.request('/sign-in/email-otp', {
    email,
    otp: fixture.sent.get(email)
  })
  assert.equal(response.status, 200, await response.clone().text())
  return {
    response,
    cookie: mergeCookies(response),
    user: (await response.clone().json()).user as {
      id: string
      email: string
      emailVerified: boolean
    }
  }
}

test('email-code sign-in is allowlisted, hashed, single-use, and authorizes the real Radarr routes', async () => {
  const fixture = await authFixture()
  const outsider = await fixture.request('/email-otp/send-verification-otp', {
    email: 'outsider@example.com',
    type: 'sign-in'
  })
  assert.equal(outsider.status, 200)
  assert.deepEqual(await outsider.json(), { success: true })
  assert.equal(fixture.sent.size, 0)
  assert.equal((await owner`SELECT id FROM auth_verification`).length, 0)
  const sent = await fixture.request('/email-otp/send-verification-otp', {
    email: 'MEMBER@example.com',
    type: 'sign-in'
  })
  assert.equal(sent.status, 200)
  const otp = fixture.sent.get('member@example.com')!
  assert.match(otp, /^\d{6}$/)
  const [stored] = await owner`SELECT value FROM auth_verification`
  assert.match(stored.value, /^[a-f0-9]{64}:0$/)
  assert.notEqual(stored.value.split(':')[0], otp, 'Raw OTP was persisted')
  const wrong = otp === '000000' ? '111111' : '000000'
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'member@example.com',
        otp: wrong
      })
    ).status,
    400
  )
  const signedIn = await fixture.request('/sign-in/email-otp', {
    email: 'member@example.com',
    otp
  })
  assert.equal(signedIn.status, 200, await signedIn.clone().text())
  assert.equal((await signedIn.clone().json()).user.emailVerified, true)
  const cookies = signedIn.headers.getSetCookie().join(';')
  assert.match(cookies, /HttpOnly/i)
  assert.match(cookies, /Secure/i)
  assert.match(cookies, /SameSite=Lax/i)
  assert.ok(
    !/Domain=/i.test(cookies),
    'Session cookie escaped the app hostname'
  )
  const cookie = mergeCookies(signedIn)
  // The session authorizes the real Radarr routes for this member.
  assert.equal((await getLibrary(cookie)).status, 200)
  assert.equal(
    (await postSearch(cookie, { movieIds: [] }, 'https://sibling.auth.test'))
      .status,
    403
  )
  assert.equal((await postSearch(cookie, { movieIds: [] })).status, 400)
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'member@example.com',
        otp
      })
    ).status,
    400
  )
  assert.equal((await fixture.request('/sign-out', {}, cookie)).status, 200)
  assert.equal(
    await (await fixture.request('/get-session', undefined, cookie)).json(),
    null
  )
  assert.equal((await getLibrary(cookie)).status, 401)
})

test('native profile updates persist for the verified owner without changing identity or permissions', async () => {
  const fixture = await authFixture()
  const { cookie, user } = await signInFixture(fixture)
  const other = await signInFixture(fixture, 'second@example.com')
  const { createProfileHandler } = await import('../src/server/profile-handler')
  const handler = createProfileHandler(fixture.db, {
    origin: authOrigin,
    allowedEmails: fixture.settings.allowedEmails,
    getSession: (headers) => fixture.auth.api.getSession({ headers })
  })
  const read = (session = cookie) =>
    handler(
      new Request(authOrigin + '/api/profile', { headers: { Cookie: session } })
    )
  const update = (
    body: unknown,
    extra: Record<string, string> = {},
    session = cookie
  ) => fixture.request('/update-user', body, session, extra)
  assert.equal((await update({ name: 'New' }, {}, '')).status, 401)
  const details = {
    name: '  Display Name  ',
    givenName: 'Given',
    familyName: 'Family'
  }
  assert.equal(
    (await update(details, { Origin: 'https://sibling.auth.test' })).status,
    403
  )
  assert.equal((await update(details, { Origin: '' })).status, 403)
  for (const field of [
    { email: 'attacker@example.com' },
    { emailVerified: true },
    { userId: other.user.id },
    { role: 'admin' },
    { image: 'https://example.com/track' }
  ])
    assert.equal((await update({ ...details, ...field })).status, 400)
  assert.equal((await update({ ...details, name: '' })).status, 400)
  assert.equal(
    (await update({ ...details, name: 'x'.repeat(121) })).status,
    400
  )
  assert.equal((await update(details)).status, 200)
  const saved = await read()
  assert.equal(saved.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await saved.json(), {
    name: 'Display Name',
    givenName: 'Given',
    familyName: 'Family',
    email: user.email,
    emailVerified: true,
    image: null
  })
  const [stored] =
    await owner`SELECT name,email,email_verified,given_name,family_name FROM auth_user WHERE id=${user.id}`
  assert.equal(stored.name, 'Display Name')
  assert.equal(stored.email, user.email)
  assert.equal(stored.email_verified, true)
  const different = await (await read(other.cookie)).json()
  assert.equal(different.email, other.user.email)
  assert.equal(different.givenName, '')
  assert.equal((await update({ givenName: null })).status, 200)
  assert.equal((await (await read()).json()).givenName, '')
  assert.equal((await (await read()).json()).familyName, 'Family')
  const routed = await application.fetch(
    new Request(authOrigin + '/api/auth/update-user', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: authOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Routed Name' })
    })
  )
  assert.equal(routed.status, 200, await routed.clone().text())
  const session = await fixture.request('/get-session', undefined, cookie)
  const sessionUser = (await session.json()).user
  assert.equal(sessionUser.name, 'Routed Name')
  assert.equal(sessionUser.givenName, '')
  assert.equal(sessionUser.familyName, 'Family')
  await owner`UPDATE auth_user SET email_verified=false WHERE id=${user.id}`
  assert.equal((await read()).status, 403)
  assert.equal((await update({ name: 'No' })).status, 401)
  await owner`UPDATE auth_user SET email_verified=true,email='removed@example.com' WHERE id=${user.id}`
  assert.equal((await read()).status, 403)
  assert.equal((await update({ name: 'No' })).status, 401)
})

test('profile photos are bounded, re-encoded, private to their owner and removable', async () => {
  const fixture = await authFixture()
  const { cookie, user } = await signInFixture(fixture)
  const other = await signInFixture(fixture, 'second@example.com')
  const { createProfileHandler } = await import('../src/server/profile-handler')
  const handler = createProfileHandler(fixture.db, {
    origin: authOrigin,
    allowedEmails: fixture.settings.allowedEmails,
    getSession: (headers) => fixture.auth.api.getSession({ headers })
  })
  const image = await sharp({
    create: { width: 64, height: 32, channels: 3, background: '#8844ff' }
  })
    .png()
    .withMetadata({ exif: { IFD0: { Artist: 'Test metadata to strip' } } })
    .toBuffer()
  const request = (
    method = 'GET',
    body?: BodyInit,
    type = 'image/png',
    session = cookie,
    extra: Record<string, string> = {}
  ) =>
    handler(
      new Request(authOrigin + '/api/profile/avatar', {
        method,
        body,
        headers: {
          Origin: authOrigin,
          Cookie: session,
          'Content-Type': type,
          ...extra
        }
      })
    )
  assert.equal(
    (await request('PUT', new Uint8Array(image), 'image/png', '')).status,
    401
  )
  assert.equal(
    (
      await request('PUT', new Uint8Array(image), 'image/png', cookie, {
        Origin: 'https://sibling.auth.test'
      })
    ).status,
    403
  )
  assert.equal(
    (await request('PUT', '<svg onload="alert(1)"/>', 'image/svg+xml')).status,
    415
  )
  assert.equal(
    (await request('PUT', '<svg onload="alert(1)"/>', 'image/png')).status,
    400
  )
  assert.equal(
    (await request('PUT', new Uint8Array(2 * 1024 * 1024 + 1))).status,
    413
  )
  const first = await request('PUT', new Uint8Array(image))
  assert.equal(first.status, 200, await first.clone().text())
  const initial = await first.json()
  assert.match(initial.image, /^\/api\/profile\/avatar\?v=/)
  assert.equal(
    (await fixture.request('/update-user', { image: initial.image }, cookie))
      .status,
    200
  )
  assert.equal(
    (
      await fixture.request(
        '/update-user',
        { image: initial.image },
        other.cookie
      )
    ).status,
    400
  )
  assert.equal(
    (await fixture.request('/update-user', { image: null }, cookie)).status,
    400
  )
  const picture = await request()
  assert.equal(picture.status, 200)
  assert.equal(picture.headers.get('Content-Type'), 'image/jpeg')
  assert.equal(picture.headers.get('Cache-Control'), 'no-store')
  assert.equal(
    picture.headers.get('Cross-Origin-Resource-Policy'),
    'same-origin'
  )
  const metadata = await sharp(
    Buffer.from(await picture.arrayBuffer())
  ).metadata()
  assert.equal(metadata.format, 'jpeg')
  assert.equal(metadata.width, 256)
  assert.equal(metadata.height, 256)
  assert.equal(metadata.exif, undefined)
  assert.equal(
    (await request('GET', undefined, 'image/png', other.cookie)).status,
    404
  )
  const next = await (await request('PUT', new Uint8Array(image))).json()
  assert.notEqual(next.image, initial.image)
  const [stored] = await owner`SELECT image FROM auth_user WHERE id=${user.id}`
  assert.equal(stored.image, next.image)
  const routed = await application.fetch(
    new Request(authOrigin + '/api/profile/avatar', {
      method: 'PUT',
      headers: {
        Origin: authOrigin,
        Cookie: cookie,
        'Content-Type': 'image/png'
      },
      body: new Uint8Array(image)
    })
  )
  assert.equal(routed.status, 200, await routed.clone().text())
  assert.equal((await request('DELETE')).status, 200)
  assert.equal(
    (await fixture.request('/update-user', { image: null }, cookie)).status,
    200
  )
  assert.equal((await request()).status, 404)
  const [removed] = await owner`SELECT image FROM auth_user WHERE id=${user.id}`
  assert.equal(removed.image, null)
  // The real application routes use the same protected handler.
  assert.equal(
    (await application.fetch(new Request(authOrigin + '/api/profile'))).status,
    401
  )
  assert.equal(
    (await application.fetch(new Request(authOrigin + '/api/profile/avatar')))
      .status,
    401
  )
})

test('OTP expiry, attempt limits and cross-site protections reject invalid access', async () => {
  const fixture = await authFixture()
  const crossSite = await fixture.request(
    '/email-otp/send-verification-otp',
    { email: 'member@example.com', type: 'sign-in' },
    '',
    { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }
  )
  assert.equal(crossSite.status, 403)
  assert.equal(fixture.sent.size, 0)
  assert.equal((await owner`SELECT key FROM auth_email_limit`).length, 0)
  await fixture.request('/email-otp/send-verification-otp', {
    email: 'member@example.com',
    type: 'sign-in'
  })
  const otp = fixture.sent.get('member@example.com')!
  const wrong = otp === '000000' ? '111111' : '000000'
  for (let attempt = 0; attempt < 5; attempt++)
    assert.equal(
      (
        await fixture.request('/sign-in/email-otp', {
          email: 'member@example.com',
          otp: wrong
        })
      ).status,
      400
    )
  const exhausted = await fixture.request('/sign-in/email-otp', {
    email: 'member@example.com',
    otp
  })
  assert.equal(exhausted.status, 403)
  assert.equal((await exhausted.json()).code, 'TOO_MANY_ATTEMPTS')
  assert.equal(
    (
      await fixture.request('/email-otp/send-verification-otp', {
        email: 'second@example.com',
        type: 'sign-in'
      })
    ).status,
    200
  )
  await owner`UPDATE auth_verification SET expires_at = now() - interval '1 second'`
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'second@example.com',
        otp: fixture.sent.get('second@example.com')
      })
    ).status,
    400
  )
  assert.equal((await owner`SELECT id FROM auth_user`).length, 0)
})

test('concurrent resends preserve the usable code and cannot exceed the app email budget', async () => {
  const fixture = await authFixture(1)
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      fixture.request('/email-otp/send-verification-otp', {
        email: 'member@example.com',
        type: 'sign-in'
      })
    )
  )
  assert.equal(
    responses.filter((response) => response.status === 200).length,
    1
  )
  assert.equal(
    responses.filter((response) => response.status === 429).length,
    3
  )
  assert.equal(fixture.sent.size, 1)
  const [global] =
    await owner`SELECT count FROM auth_email_limit WHERE key = 'global:day'`
  assert.equal(global.count, 1)
  // A different recipient still shares the same app-wide budget.
  assert.equal(
    (
      await fixture.request('/email-otp/send-verification-otp', {
        email: 'second@example.com',
        type: 'sign-in'
      })
    ).status,
    429
  )
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'member@example.com',
        otp: fixture.sent.get('member@example.com')
      })
    ).status,
    200
  )
})

test('rate limits persist across independent auth instances', async () => {
  const fixture = await authFixture()
  const extra = { 'CF-Connecting-IP': '203.0.113.200' }
  for (let index = 0; index < 3; index++)
    assert.equal(
      (
        await fixture.request(
          '/email-otp/send-verification-otp',
          { email: 'outsider@example.com', type: 'sign-in' },
          '',
          extra
        )
      ).status,
      200
    )
  const { createSortarrAuth } = await import('../src/server/auth-factory')
  const restarted = createSortarrAuth(
    fixture.db,
    fixture.settings,
    async () => {
      throw new Error('Must not send')
    }
  )
  const response = await restarted.handler(
    new Request(authOrigin + '/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers: {
        Origin: authOrigin,
        'Content-Type': 'application/json',
        ...extra
      },
      body: JSON.stringify({ email: 'outsider@example.com', type: 'sign-in' })
    })
  )
  assert.equal(response.status, 429)
  assert.ok((await owner`SELECT id FROM auth_rate_limit`).length > 0)
})

test('a throttled allowlisted address gets the same answer as an unlisted one', async () => {
  const fixture = await authFixture()
  const endpoints = [
    ['/email-otp/send-verification-otp', { type: 'sign-in' }],
    ['/sign-in/magic-link', { callbackURL: '/profile' }],
    ['/request-password-reset', { redirectTo: '/auth/reset-password' }]
  ] as const
  const answer = async (path: string, extra: object, email: string) => {
    const response = await fixture.request(path, { email, ...extra })
    return { status: response.status, body: await response.text() }
  }
  assert.equal(
    (await answer(endpoints[0][0], endpoints[0][1], 'member@example.com'))
      .status,
    200
  )
  const code = fixture.sent.get('member@example.com')
  for (const [path, extra] of endpoints) {
    const throttled = await answer(path, extra, 'member@example.com')
    const unlisted = await answer(path, extra, 'stranger@example.com')
    assert.deepEqual(throttled, unlisted, path)
    assert.equal(throttled.status, 200, path)
  }
  // Nothing more was sent or charged, and the first code still works.
  assert.equal(fixture.links.length, 0)
  assert.equal(fixture.sent.get('member@example.com'), code)
  const [global] =
    await owner`SELECT count FROM auth_email_limit WHERE key = 'global:day'`
  assert.equal(global.count, 1)
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'member@example.com',
        otp: code
      })
    ).status,
    200
  )
})

test('a permitted resend rotates the code and cannot revive older verification records', async () => {
  const fixture = await authFixture()
  const send = () =>
    fixture.request('/email-otp/send-verification-otp', {
      email: 'member@example.com',
      type: 'sign-in'
    })
  assert.equal((await send()).status, 200)
  const old = fixture.sent.get('member@example.com')!
  await owner`UPDATE auth_email_limit SET window_started_at = now() - interval '61 seconds' WHERE key LIKE '%:minute'`
  assert.equal((await send()).status, 200)
  const fresh = fixture.sent.get('member@example.com')!
  if (old !== fresh)
    assert.equal(
      (
        await fixture.request('/sign-in/email-otp', {
          email: 'member@example.com',
          otp: old
        })
      ).status,
      400
    )
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'member@example.com',
        otp: fresh
      })
    ).status,
    200
  )
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'member@example.com',
        otp: old
      })
    ).status,
    400
  )
  assert.equal((await owner`SELECT id FROM auth_verification`).length, 0)
})

test('unverified or removed member emails cannot access data or enroll passkeys', async () => {
  const fixture = await authFixture()
  const { cookie, user } = await signInFixture(fixture)
  const profile = () =>
    application.fetch(
      new Request(authOrigin + '/api/profile', { headers: { Cookie: cookie } })
    )
  assert.equal((await getLibrary(cookie)).status, 200)
  assert.equal((await profile()).status, 200)
  const contacted = radarrRequests.length
  await owner`UPDATE auth_user SET email_verified = false WHERE id = ${user.id}`
  assert.equal((await getLibrary(cookie)).status, 401)
  assert.equal((await postSearch(cookie)).status, 401)
  assert.equal((await profile()).status, 403)
  assert.equal(
    (
      await fixture.request(
        '/passkey/generate-register-options',
        undefined,
        cookie
      )
    ).status,
    401
  )
  await owner`UPDATE auth_user SET email_verified = true, email = 'outsider@example.com' WHERE id = ${user.id}`
  assert.equal((await getLibrary(cookie)).status, 401)
  assert.equal((await postSearch(cookie)).status, 401)
  assert.equal((await profile()).status, 403)
  assert.equal(
    (
      await fixture.request(
        '/passkey/generate-register-options',
        undefined,
        cookie
      )
    ).status,
    401
  )
  assert.equal(
    (await fixture.request('/passkey/generate-register-options')).status,
    401
  )
  assert.equal(radarrRequests.length, contacted, 'Radarr was contacted')
})

test('removing an address from AUTH_ALLOWED_EMAILS revokes its live session on the next request', async () => {
  const fixture = await authFixture()
  const { cookie } = await signInFixture(fixture, 'second@example.com')
  const profile = () =>
    application.fetch(
      new Request(authOrigin + '/api/profile', { headers: { Cookie: cookie } })
    )
  assert.equal((await getLibrary(cookie)).status, 200)
  assert.equal((await profile()).status, 200)
  const contacted = radarrRequests.length
  process.env.AUTH_ALLOWED_EMAILS = 'member@example.com'
  try {
    assert.equal((await getLibrary(cookie)).status, 401)
    assert.equal((await postSearch(cookie)).status, 401)
    assert.equal((await profile()).status, 403)
    assert.equal(radarrRequests.length, contacted, 'Radarr was contacted')
  } finally {
    process.env.AUTH_ALLOWED_EMAILS = allowedEmails.join(',')
  }
  assert.equal((await getLibrary(cookie)).status, 200)
})

test('passkeys enroll after verified sign-in and enforce RP, origin, verification and challenge replay', async () => {
  const fixture = await authFixture()
  const { cookie, user } = await signInFixture(fixture)
  const authenticator = virtualAuthenticator(authOrigin)
  const registration = await fixture.request(
    '/passkey/generate-register-options',
    undefined,
    cookie
  )
  assert.equal(registration.status, 200, await registration.clone().text())
  const options = await registration.json()
  assert.equal(options.rp.id, new URL(authOrigin).hostname)
  assert.equal(options.authenticatorSelection.userVerification, 'required')
  const registered = await fixture.request(
    '/passkey/verify-registration',
    {
      response: authenticator.registration(options.challenge),
      name: 'Disposable authenticator'
    },
    mergeCookies(registration, cookie)
  )
  assert.equal(registered.status, 200, await registered.clone().text())
  const [passkey] =
    await owner`SELECT id, user_id FROM auth_passkey WHERE credential_id = ${authenticator.id}`
  assert.equal(passkey.user_id, user.id)
  await fixture.request('/sign-out', {}, cookie)
  const challenge = await fixture.request(
    '/passkey/generate-authenticate-options'
  )
  const challengeData = await challenge.json()
  const assertion = authenticator.assertion(challengeData.challenge, user.id)
  const signedIn = await fixture.request(
    '/passkey/verify-authentication',
    { response: assertion },
    mergeCookies(challenge)
  )
  assert.equal(signedIn.status, 200, await signedIn.clone().text())
  assert.equal((await signedIn.clone().json()).user.id, user.id)
  assert.ok(mergeCookies(signedIn).includes('session_token='))
  assert.equal(
    (
      await fixture.request(
        '/passkey/verify-authentication',
        { response: assertion },
        mergeCookies(challenge)
      )
    ).status,
    400
  )
  for (const invalid of [
    { origin: 'https://evil.example' },
    { hostname: 'evil.example' },
    { verified: false }
  ]) {
    const next = await fixture.request('/passkey/generate-authenticate-options')
    const data = await next.json()
    const rejected = await fixture.request(
      '/passkey/verify-authentication',
      {
        response: authenticator.assertion(data.challenge, user.id, {
          ...invalid,
          counter: 2
        })
      },
      mergeCookies(next)
    )
    assert.ok(rejected.status >= 400, 'Invalid WebAuthn assertion was accepted')
  }
  const signedCookie = mergeCookies(signedIn)
  assert.equal(
    (
      await fixture.request(
        '/passkey/delete-passkey',
        { id: passkey.id },
        signedCookie
      )
    ).status,
    200
  )
  assert.equal((await owner`SELECT id FROM auth_passkey`).length, 0)
})

test('mail failure keeps the generic answer; unused auth surfaces stay disabled', async () => {
  const fixture = await authFixture(40, true)
  // Better Auth deliberately keeps the send response generic even if the
  // delivery callback fails.
  assert.equal(
    (
      await fixture.request('/email-otp/send-verification-otp', {
        email: 'member@example.com',
        type: 'sign-in'
      })
    ).status,
    200
  )
  assert.equal(fixture.sent.size, 0)
  for (const path of ['/email-otp/get-verification-otp', '/sign-up/email'])
    assert.equal(
      (
        await application.fetch(
          new Request(authOrigin + '/api/auth' + path, {
            method: 'POST',
            headers: { Origin: authOrigin, 'Content-Type': 'application/json' },
            body: '{}'
          })
        )
      ).status,
      404
    )
  // The new sign-in methods are reachable through the app's auth route.
  for (const path of [
    '/sign-in/email',
    '/sign-in/magic-link',
    '/request-password-reset',
    '/reset-password',
    '/list-accounts'
  ])
    assert.notEqual(
      (
        await application.fetch(
          new Request(authOrigin + '/api/auth' + path, {
            method: path === '/list-accounts' ? 'GET' : 'POST',
            headers: { Origin: authOrigin, 'Content-Type': 'application/json' },
            body: path === '/list-accounts' ? undefined : '{}'
          })
        )
      ).status,
      404,
      path
    )
  // Liveness does not depend on mail or the database.
  assert.equal(
    (await application.fetch(new Request(authOrigin + '/api/health'))).status,
    200
  )
})

test('password, reset links and magic links are allowlisted and sign-up stays closed', async () => {
  const fixture = await authFixture()
  const password = 'correct horse battery staple'
  // No public sign-up, even for an allowlisted address.
  const signUp = await fixture.request('/sign-up/email', {
    email: 'member@example.com',
    password,
    name: 'Member'
  })
  assert.equal(signUp.status, 400, await signUp.clone().text())
  const { user } = await signInFixture(fixture)
  // An account created by email code has no password until a reset link sets one.
  const noPassword = await fixture.request('/sign-in/email', {
    email: 'member@example.com',
    password
  })
  assert.equal(noPassword.status, 401)
  // The sign-in code used this address's one-email-a-minute allowance. The
  // refusal looks exactly like the answer for an address that gets no mail.
  const tooSoon = await fixture.request('/request-password-reset', {
    email: 'member@example.com',
    redirectTo: '/auth/reset-password'
  })
  assert.equal(tooSoon.status, 200)
  assert.deepEqual(await tooSoon.json(), { status: true })
  assert.equal(fixture.links.length, 0)
  await owner`DELETE FROM auth_email_limit`

  // Reset: generic answer for everyone, mail only for allowlisted members.
  for (const email of ['stranger@example.com', 'MEMBER@example.com '])
    assert.equal(
      (
        await fixture.request('/request-password-reset', {
          email,
          redirectTo: '/auth/reset-password'
        })
      ).status,
      200
    )
  assert.deepEqual(
    fixture.links.map(({ email, kind }) => [email, kind]),
    [['member@example.com', 'reset-password']]
  )
  const resetUrl = new URL(fixture.links[0].url)
  assert.equal(resetUrl.origin, authOrigin)
  const token = resetUrl.pathname.split('/').at(-1)!
  const tooShort = await fixture.request('/reset-password', {
    newPassword: 'short',
    token
  })
  assert.equal(tooShort.status, 400)
  const reset = await fixture.request('/reset-password', {
    newPassword: password,
    token
  })
  assert.equal(reset.status, 200, await reset.clone().text())
  assert.equal(
    (
      await fixture.request('/reset-password', {
        newPassword: password + '!',
        token
      })
    ).status,
    400,
    'Reset tokens are single-use'
  )
  const [credential] = await owner`
    SELECT password FROM auth_account
    WHERE user_id = ${user.id} AND provider_id = 'credential'`
  assert.ok(credential.password && !credential.password.includes(password))

  assert.equal(
    (
      await fixture.request('/sign-in/email', {
        email: 'member@example.com',
        password: 'wrong password entirely'
      })
    ).status,
    401
  )
  const signedIn = await fixture.request('/sign-in/email', {
    email: 'member@example.com',
    password
  })
  assert.equal(signedIn.status, 200, await signedIn.clone().text())
  const session = await fixture.request(
    '/get-session',
    undefined,
    mergeCookies(signedIn)
  )
  assert.equal((await session.json()).user.id, user.id)

  // Magic link: allowlisted only, same-origin callback, single use.
  fixture.links.length = 0
  assert.equal(
    (
      await fixture.request('/sign-in/magic-link', {
        email: 'stranger@example.com',
        callbackURL: '/profile'
      })
    ).status,
    200
  )
  assert.equal(fixture.links.length, 0)
  for (const callbackURL of [
    'https://attacker.example/',
    '//attacker.example/',
    '/.//attacker.example/',
    '/\t/attacker.example/',
    '/\\attacker.example/'
  ]) {
    // Stay under the per-IP magic-link limit; this checks the redirect guard.
    await owner`DELETE FROM auth_rate_limit`
    assert.equal(
      (
        await fixture.request('/sign-in/magic-link', {
          email: 'second@example.com',
          callbackURL
        })
      ).status,
      403,
      JSON.stringify(callbackURL)
    )
  }
  await owner`DELETE FROM auth_rate_limit`
  // Three reset requests above used this IP's per-minute allowance.
  await owner`DELETE FROM auth_rate_limit`
  assert.equal(
    (
      await fixture.request('/request-password-reset', {
        email: 'member@example.com',
        redirectTo: 'https://attacker.example/reset'
      })
    ).status,
    403
  )
  assert.equal(fixture.links.length, 0)
  const requested = await fixture.request('/sign-in/magic-link', {
    email: 'second@example.com',
    callbackURL: authOrigin + '/profile'
  })
  assert.equal(requested.status, 200, await requested.clone().text())
  assert.deepEqual(
    fixture.links.map(({ email, kind }) => [email, kind]),
    [['second@example.com', 'magic-link']]
  )
  const magic = new URL(fixture.links[0].url)
  assert.equal(magic.origin, authOrigin)
  const verify = () =>
    fixture.auth.handler(
      new Request(magic, {
        headers: { 'CF-Connecting-IP': '203.0.113.250' },
        redirect: 'manual'
      })
    )
  const verified = await verify()
  assert.equal(verified.status, 302)
  assert.equal(verified.headers.get('location'), authOrigin + '/profile')
  const magicSession = await fixture.request(
    '/get-session',
    undefined,
    mergeCookies(verified)
  )
  const magicUser = (await magicSession.json()).user
  assert.equal(magicUser.email, 'second@example.com')
  assert.equal(magicUser.emailVerified, true)
  const replay = await verify()
  assert.equal(mergeCookies(replay).includes('session_token'), false)
  const [stored] = await owner`
    SELECT count(*)::int AS users FROM auth_user
    WHERE email = 'stranger@example.com'`
  assert.equal(stored.users, 0)
})
