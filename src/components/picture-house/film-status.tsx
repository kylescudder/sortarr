import {
  CircleAlertIcon,
  DownloadIcon,
  LoaderCircleIcon,
  SearchXIcon
} from 'lucide-react'
import type { FilmStatus } from '../../../shared/status'

const ago = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

// One line under a film's title saying what Radarr is doing with it.
export function FilmStatusLine({
  status,
  now,
  onSearchAgain
}: {
  status: FilmStatus
  now: number
  onSearchAgain: () => void
}) {
  const line = 'mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'
  switch (status.state) {
    case 'searching':
      return (
        <p className={`${line} text-lamp`}>
          <LoaderCircleIcon
            aria-hidden='true'
            className='size-3.5 animate-spin'
          />
          Searching Radarr…
        </p>
      )
    case 'downloading': {
      const percent =
        status.progress === null ? null : Math.round(status.progress * 100)
      return (
        <div className='mt-2 max-w-sm'>
          <p className={`${line} text-lamp mt-0`}>
            <DownloadIcon className='size-3.5' />
            {percent === null
              ? (status.note ?? 'Waiting for the download to start')
              : `Downloading ${percent}%${status.minutesLeft ? `, about ${status.minutesLeft} min left` : ''}`}
          </p>
          {percent !== null && (
            <div
              className='bg-deep mt-1.5 h-1 overflow-hidden rounded-full'
              aria-hidden='true'
            >
              <div
                className='bg-lamp h-full rounded-full transition-[width] duration-700'
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
      )
    }
    case 'importing':
      return (
        <p className={`${line} text-lamp`}>
          <LoaderCircleIcon
            aria-hidden='true'
            className='size-3.5 animate-spin'
          />
          Importing into your library
        </p>
      )
    case 'grabbed':
      return (
        <p className={`${line} text-[#b6cbc6]`}>
          <DownloadIcon className='size-3.5' />
          Grabbed {ago(status.searchedAt, now)}. If it doesn’t appear soon,
          check Activity in Radarr.
        </p>
      )
    case 'not-found':
      return (
        <p className={`${line} text-[#b6cbc6]`}>
          <SearchXIcon className='size-3.5' />
          No release found when searched {ago(status.searchedAt, now)}.
          <button
            onClick={onSearchAgain}
            className='text-foreground underline underline-offset-4'
          >
            Pick to search again
          </button>
        </p>
      )
    case 'attention':
      return (
        <p className={`${line} text-destructive`}>
          <CircleAlertIcon className='size-3.5' />
          Needs attention in Radarr: {status.message}
        </p>
      )
  }
}
