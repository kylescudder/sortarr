import { RefreshCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Movie } from '../../../shared/movies'
import { Poster } from './poster'
import { Spinner } from '@/components/ui/spinner'

export function Marquee({
  feature,
  remaining,
  loading,
  busy,
  picked,
  onPick,
  onRefresh,
  menu
}: {
  feature: Movie | undefined
  remaining: number | undefined
  loading: boolean
  busy: boolean
  picked: boolean
  onPick: () => void
  onRefresh: () => void
  menu?: ReactNode
}) {
  return (
    <section
      aria-label='Shortest film you are missing'
      className='bg-deep my-7 rounded-xl px-3 sm:px-7'
    >
      <div className='bulbs' aria-hidden='true' />
      <div className='letterboard text-deep grid grid-cols-[1fr_auto] gap-x-5 gap-y-5 rounded-sm px-5 py-6 sm:gap-x-8 sm:px-8'>
        <div className='col-span-2 flex items-center gap-3 sm:gap-4'>
          <div className='mr-auto flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-4'>
            <span className='font-display text-2xl font-black tracking-[0.06em]'>
              SORTARR
            </span>
            <span className='text-sm whitespace-nowrap text-[#47615d]'>
              {remaining === undefined
                ? 'Connecting to Radarr'
                : `${remaining} films to go`}
            </span>
          </div>
          <button
            onClick={onRefresh}
            disabled={busy}
            aria-label={loading ? 'Connecting…' : 'Refresh library'}
            className='inline-flex size-9 shrink-0 items-center justify-center gap-2 rounded-full border-[1.5px] border-[#9fb6b1] text-sm font-semibold whitespace-nowrap disabled:opacity-50 sm:size-auto sm:px-3.5 sm:py-1.5'
          >
            {loading ? (
              <Spinner className='size-3.5' />
            ) : (
              <RefreshCwIcon className='size-3.5' />
            )}
            <span aria-hidden='true' className='hidden sm:inline'>
              {loading ? 'Connecting…' : 'Refresh library'}
            </span>
          </button>
          <div className='shrink-0'>{menu}</div>
        </div>
        <div className='self-end'>
          <p className='font-display text-xl font-extrabold tracking-[0.14em] sm:text-[26px]'>
            NOW SHOWING
          </p>
          <h1 className='font-display mt-2.5 mb-1.5 text-[clamp(32px,7vw,84px)] leading-[0.92] font-black tracking-[0.04em] uppercase'>
            {feature ? feature.title : 'Nothing on the reel'}
          </h1>
          {feature && (
            <p className='font-display text-xl font-extrabold tracking-[0.14em] sm:text-[32px]'>
              {feature.runtime === null
                ? 'RUNTIME UNKNOWN'
                : `${feature.runtime} MIN`}
              {feature.year ? `  ${feature.year}` : ''}
            </p>
          )}
          {feature && (
            <div className='mt-5 hidden max-w-xl text-sm text-[#47615d] sm:block'>
              <p className='mb-3 line-clamp-3'>
                {feature.overview || 'No synopsis in Radarr.'}
              </p>
              <PickButton picked={picked} busy={busy} onPick={onPick} />
            </div>
          )}
        </div>
        {feature && (
          // A lit one-sheet case, like the poster frames beside a cinema's marquee.
          <div className='border-deep bg-deep row-span-1 self-start rounded-sm border-4 shadow-[0_0_0_2px_var(--lamp),0_0_28px_rgba(255,217,138,0.45)]'>
            <Poster
              key={feature.id}
              movie={feature}
              size={500}
              eager
              className='w-24 sm:w-44'
            />
          </div>
        )}
        {feature && (
          <div className='col-span-2 text-sm text-[#47615d] sm:hidden'>
            <p className='mb-3 line-clamp-3'>
              {feature.overview || 'No synopsis in Radarr.'}
            </p>
            <PickButton picked={picked} busy={busy} onPick={onPick} />
          </div>
        )}
      </div>
      <div className='bulbs' aria-hidden='true' />
    </section>
  )
}

function PickButton({
  picked,
  busy,
  onPick
}: {
  picked: boolean
  busy: boolean
  onPick: () => void
}) {
  return (
    <button
      onClick={onPick}
      disabled={busy}
      aria-pressed={picked}
      className='bg-lamp text-deep rounded-full px-4.5 py-2.5 font-semibold disabled:opacity-50'
    >
      {picked ? 'Picked' : 'Pick this film'}
    </button>
  )
}
