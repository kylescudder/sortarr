import '@tanstack/react-start/server-only'
import { desc, gte } from 'drizzle-orm'
import type { SearchRecord } from '../../shared/status'
import { db } from './db'
import { searchRequest } from './search-schema'

// Statuses cover the past week of tickets; older searches have long settled.
const STATUS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export async function recordSearch(
  userId: string,
  commandId: number,
  movieIds: number[]
) {
  await db.insert(searchRequest).values({ userId, commandId, movieIds })
}

export async function recentSearches(
  now = Date.now()
): Promise<SearchRecord[]> {
  const rows = await db
    .select({
      commandId: searchRequest.commandId,
      movieIds: searchRequest.movieIds,
      createdAt: searchRequest.createdAt
    })
    .from(searchRequest)
    .where(gte(searchRequest.createdAt, new Date(now - STATUS_WINDOW_MS)))
    .orderBy(desc(searchRequest.createdAt))
    .limit(200)
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}
