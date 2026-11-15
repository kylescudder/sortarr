// What Radarr is doing for each film, derived from its queue, the search
// commands Sortarr sent, and its "grabbed" history. Pure, so it is tested
// without Radarr.

export type FilmStatus =
  | { state: 'searching'; searchedAt: string }
  | {
      state: 'downloading'
      progress: number | null
      minutesLeft: number | null
      note: string | null
    }
  | { state: 'importing' }
  | { state: 'grabbed'; searchedAt: string }
  | { state: 'not-found'; searchedAt: string }
  | { state: 'attention'; message: string }

export type StatusMap = Record<number, FilmStatus>

export const ACTIVE_STATES: readonly FilmStatus['state'][] = [
  'searching',
  'downloading',
  'importing'
]

export interface QueueItem {
  movieId?: number | null
  status?: string | null
  trackedDownloadStatus?: string | null
  trackedDownloadState?: string | null
  size?: number | null
  sizeleft?: number | null
  timeleft?: string | null
  errorMessage?: string | null
  statusMessages?:
    { title?: string | null; messages?: string[] | null }[] | null
}

export interface SearchRecord {
  commandId: number
  movieIds: number[]
  createdAt: string
}

// Radarr command states; 'gone' means Radarr no longer knows the command
// (it keeps only recent ones), which can only happen after it finished.
export type CommandState =
  | 'queued'
  | 'started'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'cancelled'
  | 'gone'

// "hh:mm:ss" or "d.hh:mm:ss" from Radarr; whole minutes, at least 1.
export function minutesFrom(timeleft: string | null | undefined) {
  const match = timeleft?.match(/^(?:(\d+)\.)?(\d+):(\d+):(\d+)/)
  if (!match) return null
  const [, days = '0', hours, minutes, seconds] = match
  const total =
    Number(days) * 1440 +
    Number(hours) * 60 +
    Number(minutes) +
    Number(seconds) / 60
  return Math.max(1, Math.round(total))
}

function queueStatus(item: QueueItem): FilmStatus {
  const state = item.trackedDownloadState ?? ''
  const troubled =
    ['warning', 'error'].includes(item.trackedDownloadStatus ?? '') ||
    ['failed', 'warning'].includes(item.status ?? '') ||
    ['importBlocked', 'failedPending', 'failed'].includes(state)
  if (troubled) {
    const details = (item.statusMessages ?? []).flatMap((m) =>
      m.messages?.length ? m.messages : m.title ? [m.title] : []
    )
    return {
      state: 'attention',
      message:
        details[0] ||
        item.errorMessage ||
        'Radarr reports a problem with this download.'
    }
  }
  if (state === 'importPending' || state === 'importing')
    return { state: 'importing' }
  const size = item.size ?? 0
  const progress =
    size > 0
      ? Math.round(
          Math.min(1, Math.max(0, 1 - (item.sizeleft ?? size) / size)) * 1000
        ) / 1000
      : null
  return {
    state: 'downloading',
    progress,
    minutesLeft: minutesFrom(item.timeleft),
    // A healthy download can still carry a note, e.g. "downloading metadata".
    note: progress === null ? (item.errorMessage ?? null) : null
  }
}

// Radarr and Sortarr run on separate clocks; a grab stamped up to a minute
// before the search (by Radarr's clock) still belongs to it.
export const CLOCK_SKEW_MS = 60_000

export function deriveStatuses({
  queue,
  searches,
  commands,
  grabs
}: {
  queue: QueueItem[]
  searches: SearchRecord[]
  commands: Record<number, CommandState>
  grabs: { movieId: number; date: string }[]
}): StatusMap {
  const statuses: StatusMap = {}
  for (const item of queue)
    if (item.movieId) statuses[item.movieId] = queueStatus(item)
  // Newest search first, so each film reflects its latest ticket.
  const newest = [...searches].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
  for (const search of newest) {
    const command = commands[search.commandId] ?? 'gone'
    for (const movieId of search.movieIds) {
      if (statuses[movieId]) continue
      const searchedAt = search.createdAt
      if (command === 'queued' || command === 'started')
        statuses[movieId] = { state: 'searching', searchedAt }
      else if (command === 'failed')
        statuses[movieId] = {
          state: 'attention',
          message: 'Radarr’s search failed. Try searching again.'
        }
      else if (
        grabs.some(
          (g) =>
            g.movieId === movieId &&
            Date.parse(g.date) >= Date.parse(searchedAt) - CLOCK_SKEW_MS
        )
      )
        statuses[movieId] = { state: 'grabbed', searchedAt }
      else statuses[movieId] = { state: 'not-found', searchedAt }
    }
  }
  return statuses
}
