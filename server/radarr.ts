import { z } from 'zod'
import type { Library } from '../shared/movies'
import { readOriginEnv, readRadarrEnv } from './env'
import { ApiError } from './errors'
import {
  deriveStatuses,
  type CommandState,
  type SearchRecord
} from '../shared/status'
export { ApiError }
const movieSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  year: z.number(),
  runtime: z.number().nullable().optional(),
  hasFile: z.boolean(),
  monitored: z.boolean(),
  isAvailable: z.boolean().optional().default(false),
  tags: z.array(z.number()).default([]),
  genres: z.array(z.string()).default([]),
  overview: z.string().default(''),
  status: z.string().default('unknown'),
  images: z.array(z.object({ coverType: z.string() })).default([])
})
async function radarr(
  path: string,
  options?: RequestInit,
  { missingOk = false } = {}
) {
  const { RADARR_URL, RADARR_API_KEY } = readRadarrEnv()
  const url = new URL(`${RADARR_URL}/api/v3/${path}`)
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'X-Api-Key': RADARR_API_KEY,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'error'
    })
  } catch {
    throw new ApiError(
      'Could not reach Radarr. Check its address and the server network connection.'
    )
  }
  if (missingOk && response.status === 404) return null
  if (!response.ok)
    throw new ApiError(
      response.status === 401 || response.status === 403
        ? 'Radarr rejected the API key. Check RADARR_API_KEY.'
        : `Radarr returned HTTP ${response.status}. Try again after checking Radarr.`
    )
  try {
    return await response.json()
  } catch {
    throw new ApiError('Radarr returned an unreadable response.')
  }
}
export async function library(): Promise<Library> {
  const [rawMovies, rawTags] = await Promise.all([
    radarr('movie'),
    radarr('tag')
  ])
  const movies = z.array(movieSchema).safeParse(rawMovies)
  const tags = z
    .array(z.object({ id: z.number(), label: z.string() }))
    .safeParse(rawTags)
  if (!movies.success || !tags.success)
    throw new ApiError(
      'Radarr returned unexpected movie or tag data. Check your Radarr version.'
    )
  return {
    movies: movies.data
      .filter((m) => !m.hasFile)
      .map((m) => ({
        id: m.id,
        title: m.title,
        year: m.year,
        runtime: m.runtime && m.runtime > 0 ? m.runtime : null,
        monitored: m.monitored,
        isAvailable: m.isAvailable,
        tags: m.tags,
        genres: m.genres,
        overview: m.overview,
        hasPoster: m.images.some((image) => image.coverType === 'poster'),
        status: m.status
      })),
    tags: tags.data,
    fetchedAt: new Date().toISOString()
  }
}
let searchInProgress = false
export async function search(request: Request) {
  // Require the browser's actual origin; do not trust forwarded headers for this check.
  const expected = readOriginEnv().APP_ORIGIN ?? new URL(request.url).origin
  if (request.headers.get('origin') !== expected)
    throw new ApiError('Search must be submitted from this app.', 403)
  const input = z
    .object({ movieIds: z.array(z.number().int().positive()).min(1).max(20) })
    .safeParse(await request.json().catch(() => null))
  if (!input.success)
    throw new ApiError('Select between 1 and 20 films to search.', 400)
  if (searchInProgress)
    throw new ApiError(
      'Another search is being submitted. Wait before trying again.',
      409
    )
  searchInProgress = true
  try {
    const ids = [...new Set(input.data.movieIds)]
    const current = await library()
    if (ids.some((id) => !current.movies.some((m) => m.id === id)))
      throw new ApiError(
        'A selected film is no longer missing. Refresh the list before searching.',
        409
      )
    const command = z.object({ id: z.number(), status: z.string() }).safeParse(
      await radarr('command', {
        method: 'POST',
        body: JSON.stringify({ name: 'MoviesSearch', movieIds: ids })
      })
    )
    if (!command.success)
      throw new ApiError(
        'Radarr did not return a search receipt. Check Activity in Radarr before retrying.'
      )
    return {
      commandId: command.data.id,
      status: command.data.status,
      count: ids.length,
      movieIds: ids
    }
  } finally {
    searchInProgress = false
  }
}
const queueSchema = z.object({
  records: z.array(
    z.object({
      movieId: z.number().nullable().optional(),
      status: z.string().nullable().optional(),
      trackedDownloadStatus: z.string().nullable().optional(),
      trackedDownloadState: z.string().nullable().optional(),
      size: z.number().nullable().optional(),
      sizeleft: z.number().nullable().optional(),
      timeleft: z.string().nullable().optional(),
      errorMessage: z.string().nullable().optional(),
      statusMessages: z
        .array(
          z.object({
            title: z.string().nullable().optional(),
            messages: z.array(z.string()).nullable().optional()
          })
        )
        .nullable()
        .optional()
    })
  )
})
const grabSchema = z.array(z.object({ movieId: z.number(), date: z.string() }))
const commandSchema = z.object({ status: z.string() })
// Searches finish within minutes; older commands are treated as finished
// rather than asking Radarr about every ticket from the past week.
const COMMAND_LOOKBACK_MS = 6 * 60 * 60 * 1000

async function commandState(id: number): Promise<CommandState> {
  const body = await radarr(`command/${id}`, undefined, { missingOk: true })
  if (body === null) return 'gone'
  const parsed = commandSchema.safeParse(body)
  return parsed.success ? (parsed.data.status as CommandState) : 'gone'
}

// What Radarr is doing for films in its queue and for recent Sortarr searches.
export async function activity(searches: SearchRecord[], now = Date.now()) {
  const oldest = searches.reduce(
    (min, s) => Math.min(min, Date.parse(s.createdAt)),
    now
  )
  const recent = searches.filter(
    (s) => now - Date.parse(s.createdAt) < COMMAND_LOOKBACK_MS
  )
  const [queue, grabs, commands] = await Promise.all([
    radarr('queue?page=1&pageSize=1000&includeMovie=false'),
    searches.length
      ? radarr(
          `history/since?date=${encodeURIComponent(new Date(oldest).toISOString())}&eventType=grabbed`
        )
      : [],
    Promise.all(
      recent.map(async (s) => [s.commandId, await commandState(s.commandId)])
    )
  ])
  const parsedQueue = queueSchema.safeParse(queue)
  const parsedGrabs = grabSchema.safeParse(grabs)
  if (!parsedQueue.success || !parsedGrabs.success)
    throw new ApiError(
      'Radarr returned unexpected queue or history data. Check your Radarr version.'
    )
  return deriveStatuses({
    queue: parsedQueue.data.records,
    searches,
    commands: Object.fromEntries(commands),
    grabs: parsedGrabs.data
  })
}

// Radarr resizes and caches posters itself; fetched server-side so the API key
// never reaches the browser and nothing is loaded from TMDb.
export async function poster(movieId: number, width: 250 | 500) {
  const { RADARR_URL, RADARR_API_KEY } = readRadarrEnv()
  let response: Response
  try {
    response = await fetch(
      `${RADARR_URL}/api/v3/mediacover/${movieId}/poster-${width}.jpg`,
      {
        headers: { 'X-Api-Key': RADARR_API_KEY },
        signal: AbortSignal.timeout(15000),
        redirect: 'error'
      }
    )
  } catch {
    throw new ApiError('Could not reach Radarr for this poster.')
  }
  if (response.status === 404)
    throw new ApiError('No poster for this film.', 404)
  if (!response.ok || response.headers.get('content-type') !== 'image/jpeg')
    throw new ApiError('Radarr could not supply this poster.')
  return new Response(response.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      // Posters rarely change; keep them in this browser for a day.
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin'
    }
  })
}

export async function respond(action: () => Promise<unknown>) {
  try {
    return Response.json(await action(), {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : 'The request failed. Check the server configuration and try again.'
      },
      {
        status: error instanceof ApiError ? error.status : 500,
        headers: { 'Cache-Control': 'no-store' }
      }
    )
  }
}
