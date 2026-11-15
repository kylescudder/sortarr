import type { Movie } from '../../../shared/movies'
import type { StatusMap } from '../../../shared/status'
import { FilmStatusLine } from './film-status'
import { Poster } from './poster'

export function Reel({
  films,
  selected,
  tagLabel,
  limitReached,
  disabled,
  onToggle,
  statuses = {},
  now = Date.now()
}: {
  films: Movie[]
  selected: number[]
  tagLabel: (id: number) => string | undefined
  limitReached: boolean
  disabled: boolean
  onToggle: (id: number, picked: boolean) => void
  statuses?: StatusMap
  now?: number
}) {
  return (
    <ol aria-label='Missing films' className='border-b'>
      {films.map((movie) => {
        const picked = selected.includes(movie.id)
        const tags = movie.tags.map(tagLabel).filter(Boolean).join(', ')
        return (
          <li
            key={movie.id}
            className='grid grid-cols-[30px_40px_56px_1fr] gap-x-3 border-t sm:grid-cols-[40px_56px_72px_1fr] sm:gap-x-4.5'
          >
            {/* The sprocket rail is the control: picked films let the light through. */}
            <button
              role='checkbox'
              aria-checked={picked}
              aria-label={`Select ${movie.title}`}
              disabled={disabled || (!picked && limitReached)}
              onClick={() => onToggle(movie.id, !picked)}
              className='sprockets self-stretch disabled:cursor-not-allowed'
            />
            <div
              className={`font-display py-4.5 text-right text-[32px] leading-[0.9] font-black sm:text-[44px] ${picked ? 'text-lamp' : 'text-muted-foreground'}`}
            >
              {movie.runtime ?? '?'}
              <small className='mt-1 block font-sans text-[13px] font-semibold'>
                {movie.runtime === null ? 'unknown' : 'min'}
              </small>
            </div>
            <div className='py-4.5'>
              <Poster
                movie={movie}
                size={250}
                className={`w-full rounded-[3px] ${picked ? 'ring-lamp ring-2' : 'ring-border ring-1'}`}
              />
            </div>
            <div className='min-w-0 py-4.5'>
              <h3 className='font-display text-[21px] leading-tight font-extrabold tracking-[0.02em] sm:text-[26px]'>
                {movie.title}
              </h3>
              <p className='mt-1 max-w-[62ch] text-sm text-[#b6cbc6]'>
                {movie.year || 'Year unknown'}
                {movie.genres.length
                  ? `, ${movie.genres.slice(0, 2).join(', ').toLowerCase()}`
                  : ''}
                {movie.monitored ? '' : ', unmonitored'}
                {movie.isAvailable ? '' : ', not yet available'}
                {tags ? `. Tagged ${tags}` : ''}
              </p>
              {movie.overview && (
                <p className='text-muted-foreground mt-1 line-clamp-2 max-w-[62ch] text-[15px]'>
                  {movie.overview}
                </p>
              )}
              {statuses[movie.id] && (
                <FilmStatusLine
                  status={statuses[movie.id]}
                  now={now}
                  canPick={!picked && !limitReached && !disabled}
                  onSearchAgain={() => onToggle(movie.id, true)}
                />
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
