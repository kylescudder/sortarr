import { expect, test } from 'bun:test'
import { deriveStatuses, minutesFrom, type QueueItem } from '../shared/status'

const at = '2026-11-15T19:00:00Z'
const later = '2026-11-15T19:05:00Z'
const earlier = '2026-11-15T18:00:00Z'
const derive = (input: Partial<Parameters<typeof deriveStatuses>[0]>) =>
  deriveStatuses({ queue: [], searches: [], commands: {}, grabs: [], ...input })

test('a search Radarr is still running shows as searching', () => {
  for (const command of ['queued', 'started'] as const)
    expect(
      derive({
        searches: [{ commandId: 7, movieIds: [1, 2], createdAt: at }],
        commands: { 7: command }
      })
    ).toEqual({
      1: { state: 'searching', searchedAt: at },
      2: { state: 'searching', searchedAt: at }
    })
})

test('a finished search with no grab since it ran means no release found', () => {
  expect(
    derive({
      searches: [{ commandId: 7, movieIds: [1], createdAt: at }],
      commands: { 7: 'completed' },
      // An older grab doesn't count for this search.
      grabs: [{ movieId: 1, date: earlier }]
    })[1]
  ).toEqual({ state: 'not-found', searchedAt: at })
})

test('a command Radarr has forgotten counts as finished', () => {
  expect(
    derive({ searches: [{ commandId: 9, movieIds: [1], createdAt: at }] })[1]
  ).toEqual({ state: 'not-found', searchedAt: at })
})

test('a grab after the search, no longer queued, is grabbed', () => {
  expect(
    derive({
      searches: [{ commandId: 7, movieIds: [1], createdAt: at }],
      commands: { 7: 'completed' },
      grabs: [{ movieId: 1, date: later }]
    })[1]
  ).toEqual({ state: 'grabbed', searchedAt: at })
})

test('a failed search asks for attention', () => {
  expect(
    derive({
      searches: [{ commandId: 7, movieIds: [1], createdAt: at }],
      commands: { 7: 'failed' }
    })[1]?.state
  ).toBe('attention')
})

test('the queue wins over search history and reports progress', () => {
  const item: QueueItem = {
    movieId: 1,
    status: 'downloading',
    trackedDownloadStatus: 'ok',
    trackedDownloadState: 'downloading',
    size: 1000,
    sizeleft: 550,
    timeleft: '00:12:20'
  }
  expect(
    derive({
      queue: [item],
      searches: [{ commandId: 7, movieIds: [1], createdAt: at }],
      commands: { 7: 'completed' }
    })[1]
  ).toEqual({
    state: 'downloading',
    progress: 0.45,
    minutesLeft: 12,
    note: null
  })
})

test('a healthy download without size yet keeps Radarr’s note, not an error', () => {
  // Radarr 6 puts "downloading metadata" in errorMessage for healthy items.
  expect(
    derive({
      queue: [
        {
          movieId: 59,
          status: 'queued',
          trackedDownloadStatus: 'ok',
          trackedDownloadState: 'downloading',
          size: 0,
          sizeleft: 0,
          timeleft: null,
          errorMessage: 'qBittorrent is downloading metadata'
        }
      ]
    })[59]
  ).toEqual({
    state: 'downloading',
    progress: null,
    minutesLeft: null,
    note: 'qBittorrent is downloading metadata'
  })
})

test('importing and troubled downloads are reported as such', () => {
  const statuses = derive({
    queue: [
      {
        movieId: 1,
        trackedDownloadStatus: 'ok',
        trackedDownloadState: 'importPending'
      },
      {
        movieId: 2,
        trackedDownloadStatus: 'warning',
        trackedDownloadState: 'importBlocked',
        statusMessages: [
          {
            title: 'Film.mkv',
            messages: ['Not an upgrade for existing movie file']
          }
        ]
      },
      { movieId: 3, status: 'failed', errorMessage: 'Download failed' }
    ]
  })
  expect(statuses[1]).toEqual({ state: 'importing' })
  expect(statuses[2]).toEqual({
    state: 'attention',
    message: 'Not an upgrade for existing movie file'
  })
  expect(statuses[3]).toEqual({
    state: 'attention',
    message: 'Download failed'
  })
})

test('the newest ticket decides a film searched twice', () => {
  expect(
    derive({
      searches: [
        { commandId: 1, movieIds: [1], createdAt: earlier },
        { commandId: 2, movieIds: [1], createdAt: at }
      ],
      commands: { 1: 'completed', 2: 'started' }
    })[1]
  ).toEqual({ state: 'searching', searchedAt: at })
})

test('time left parses hours, days and rounds to whole minutes', () => {
  expect(minutesFrom('00:00:20')).toBe(1)
  expect(minutesFrom('01:30:00')).toBe(90)
  expect(minutesFrom('1.02:00:00')).toBe(1560)
  expect(minutesFrom(null)).toBeNull()
  expect(minutesFrom('soon')).toBeNull()
})
