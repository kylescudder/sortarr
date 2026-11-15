import type { Movie } from '../../../shared/movies'
import { feetOf35mm, ticketSerial } from '../../../shared/ticket'

// Modelled on 1960s UK roll tickets: faded card, one navy ink with a red second
// ink, ruled frames, the serial printed sideways on both halves of the tear.
export function Ticket({
  films,
  disabled,
  onSearch
}: {
  films: Movie[]
  disabled: boolean
  onSearch: () => void
}) {
  const minutes = films.reduce((total, m) => total + (m.runtime ?? 0), 0)
  const unknown = films.filter((m) => m.runtime === null).length
  const serial = ticketSerial(films.map((m) => m.title))
  const admit = `ADMIT ${films.length}`
  return (
    <div className='fixed bottom-2.5 left-1/2 z-40 w-[calc(100%-20px)] max-w-[760px] -translate-x-1/2 -rotate-1 drop-shadow-[0_14px_14px_rgba(0,0,0,0.45)] sm:bottom-5'>
      <section
        aria-label='Your ticket'
        className='ticket ticket-stock bg-stock text-ink relative grid grid-cols-[1fr_var(--stub)]'
      >
        <div className='border-ink my-2.5 ml-3.5 grid grid-cols-[1fr_auto] border-[1.5px] opacity-90'>
          <div className='grid grid-cols-[auto_1fr] items-end gap-x-5 gap-y-1 px-2 pt-2 pb-2.5 sm:px-4'>
            <div className='border-ink font-display col-span-2 flex justify-between gap-3 border-b-[1.5px] pb-1.5 text-[10px] font-extrabold tracking-[0.1em] whitespace-nowrap sm:text-[15px] sm:tracking-[0.16em]'>
              <span>SCUDDER PICTURE HOUSE</span>
              <span className='hidden sm:inline'>{admit}</span>
            </div>
            <p className='font-display text-[34px] leading-[0.85] font-black whitespace-nowrap sm:text-[58px]'>
              {minutes} MIN
              <small className='mt-1.5 block font-sans text-[11px] font-semibold'>
                {feetOf35mm(minutes).toLocaleString('en-GB')} ft of 35mm
                {unknown ? `, ${unknown} unknown` : ''}
              </small>
            </p>
            <ol className='hidden min-w-0 text-[12.5px] leading-snug sm:block'>
              {films.slice(0, 3).map((m) => (
                <li key={m.id} className='leaders flex items-baseline gap-1.5'>
                  <span className='order-1 truncate'>{m.title}</span>
                  <b className='font-display order-3 text-sm font-extrabold tracking-[0.04em]'>
                    {m.runtime === null ? '?' : `${m.runtime} MIN`}
                  </b>
                </li>
              ))}
              {films.length > 3 && (
                <li className='text-right'>and {films.length - 3} more</li>
              )}
            </ol>
          </div>
          <Serial value={serial} side='left' />
        </div>
        <div className='tear border-ink relative my-2.5 mr-2.5 ml-3 grid grid-cols-[auto_1fr] border-[1.5px] opacity-90 sm:mr-3.5'>
          <Serial value={serial} side='right' />
          <div className='flex flex-col justify-between px-2.5 py-2'>
            <div className='font-display flex items-baseline justify-between font-extrabold tracking-[0.14em]'>
              <span className='hidden text-[15px] sm:inline'>
                {minutes} MIN
              </span>
              <b className='text-xl tracking-[0.04em] sm:text-[22px]'>
                {admit}
              </b>
            </div>
            <button
              onClick={onSearch}
              disabled={disabled}
              className='bg-stamp font-display hover:bg-ink mt-2 rounded-[1px] px-2 py-2 text-left text-[13px] leading-[1.05] font-extrabold tracking-[0.03em] text-[#f7e3e8] uppercase disabled:opacity-60 sm:text-[17px] sm:tracking-[0.08em]'
            >
              Search selected in Radarr
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function Serial({ value, side }: { value: string; side: 'left' | 'right' }) {
  return (
    <span
      aria-label={`Serial ${value}`}
      className={`font-display px-0.5 py-2 text-center text-sm font-extrabold tracking-[0.12em] [writing-mode:vertical-rl] sm:px-1.5 sm:text-[22px] ${side === 'left' ? 'border-l-[1.5px]' : 'border-r-[1.5px]'} border-ink`}
    >
      {value}
    </span>
  )
}
