import { z } from 'zod'
import type { Library } from '../shared/movies'
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
  status: z.string().default('unknown')
})
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 502
  ) {
    super(message)
  }
}
async function radarr(path: string, options?: RequestInit) {
  const base = process.env.RADARR_URL?.trim()
  const key = process.env.RADARR_API_KEY?.trim()
  if (!base || !key)
    throw new ApiError(
      'Set RADARR_URL and RADARR_API_KEY on the server, then restart Sortarr.',
      503
    )
  let url: URL
  try {
    url = new URL(`${base.replace(/\/+$/, '')}/api/v3/${path}`)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error()
  } catch {
    throw new ApiError(
      'RADARR_URL must be an HTTP or HTTPS base URL without credentials or a query.',
      503
    )
  }
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      redirect: 'error'
    })
  } catch {
    throw new ApiError(
      'Could not reach Radarr. Check its address and the server network connection.'
    )
  }
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
        status: m.status
      })),
    tags: tags.data,
    fetchedAt: new Date().toISOString()
  }
}
let searchInProgress = false
export async function search(request: Request) {
  // Require the browser's actual origin; do not trust forwarded headers for this check.
  // Behind Cloudflare Tunnel the container sees plain HTTP, so production pins
  // the public https origin with APP_ORIGIN.
  const expected =
    process.env.APP_ORIGIN?.trim().replace(/\/+$/, '') ||
    new URL(request.url).origin
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
      count: ids.length
    }
  } finally {
    searchInProgress = false
  }
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
