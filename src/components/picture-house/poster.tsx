import { FilmIcon } from 'lucide-react'
import { useState } from 'react'
import type { Movie } from '../../../shared/movies'

// A film's poster from Radarr, or a plain card when Radarr has none (or it
// fails to load). Fixed 2:3 frame so the list never jumps as posters arrive.
export function Poster({
  movie,
  size,
  className = '',
  eager = false
}: {
  movie: Pick<Movie, 'id' | 'title' | 'hasPoster'>
  size: 250 | 500
  className?: string
  eager?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const frame = `relative aspect-[2/3] shrink-0 overflow-hidden bg-deep ${className}`
  if (!movie.hasPoster || failed)
    return (
      <div
        className={`${frame} flex items-center justify-center`}
        aria-hidden='true'
      >
        <FilmIcon className='text-muted-foreground/60 size-1/3' />
      </div>
    )
  return (
    <img
      src={`/api/poster/${movie.id}${size === 500 ? '?size=500' : ''}`}
      alt={`Poster for ${movie.title}`}
      width={size === 500 ? 500 : 250}
      height={size === 500 ? 750 : 375}
      loading={eager ? 'eager' : 'lazy'}
      decoding='async'
      onError={() => setFailed(true)}
      className={`${frame} object-cover`}
    />
  )
}
