import { RefreshCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Movie } from '../../../shared/movies'
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
      <div className='letterboard text-deep grid gap-6 rounded-sm px-5 py-6 sm:grid-cols-[1fr_auto] sm:items-end sm:px-8'>
        <div className='flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2'>
          <span className='font-display text-2xl font-black tracking-[0.06em]'>
            SORTARR
          </span>
          <span className='mr-auto text-sm whitespace-nowrap text-[#47615d]'>
            {remaining === undefined
              ? 'Connecting to Radarr'
              : `${remaining} films to go`}
          </span>
          <button
            onClick={onRefresh}
            disabled={busy}
            className='inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#9fb6b1] px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap disabled:opacity-50'
          >
            {loading ? (
              <Spinner className='size-3.5' />
            ) : (
              <RefreshCwIcon className='size-3.5' />
            )}
            {loading ? 'Connecting…' : 'Refresh library'}
          </button>
          {menu}
        </div>
        <div>
          <p className='font-display text-xl font-extrabold tracking-[0.14em] sm:text-[26px]'>
            NOW SHOWING
          </p>
          <h1 className='font-display mt-2.5 mb-1.5 text-[clamp(40px,7.4vw,84px)] leading-[0.92] font-black tracking-[0.04em] uppercase'>
            {feature ? feature.title : 'Nothing on the reel'}
          </h1>
          {feature && (
            <p className='font-display text-2xl font-extrabold tracking-[0.14em] sm:text-[32px]'>
              {feature.runtime === null
                ? 'RUNTIME UNKNOWN'
                : `${feature.runtime} MIN`}
              {feature.year ? `  ${feature.year}` : ''}
            </p>
          )}
        </div>
        {feature && (
          <div className='max-w-60 text-sm text-[#47615d]'>
            <p className='mb-3 line-clamp-4'>
              {feature.overview || 'No synopsis in Radarr.'}
            </p>
            <button
              onClick={onPick}
              disabled={busy}
              aria-pressed={picked}
              className='bg-lamp text-deep rounded-full px-4.5 py-2.5 font-semibold disabled:opacity-50'
            >
              {picked ? 'Picked' : 'Pick this film'}
            </button>
          </div>
        )}
      </div>
      <div className='bulbs' aria-hidden='true' />
    </section>
  )
}
