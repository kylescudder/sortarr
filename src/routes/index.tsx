import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { filterMovies, type Filters, type Library } from '../../shared/movies'
export const Route = createFileRoute('/')({ component: Backlog })
const defaults: Filters = {
  query: '',
  maxRuntime: 0,
  runtime: 'known',
  monitored: true,
  available: true,
  tag: 0,
  order: 'shortest'
}
async function readResponse(response: Response) {
  const result = await response.json()
  if (!response.ok)
    throw new Error(result.error || 'The request failed. Try again.')
  return result
}
function Backlog() {
  const [data, setData] = useState<Library | null>(null)
  const [filters, setFilters] = useState<Filters>(defaults)
  const [selected, setSelected] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [searching, setSearching] = useState(false)
  async function refresh() {
    setLoading(true)
    setError('')
    setConfirming(false)
    setSelected([])
    try {
      setData(await readResponse(await fetch('/api/library')))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your library.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  const visible = filterMovies(data?.movies ?? [], filters)
  const unknown = data?.movies.filter((m) => m.runtime === null).length ?? 0
  const chosen = visible.filter((m) => selected.includes(m.id))
  const duration = chosen.reduce((total, m) => total + (m.runtime ?? 0), 0)
  function change<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((old) => ({ ...old, [key]: value }))
    setSelected([])
    setConfirming(false)
    setNotice('')
  }
  async function searchSelected() {
    if (searching) return
    setSearching(true)
    setError('')
    setNotice('')
    try {
      const result = await readResponse(
        await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movieIds: chosen.map((m) => m.id) })
        })
      )
      setNotice(
        `Search accepted for ${result.count} film${result.count === 1 ? '' : 's'}. Radarr command #${result.commandId}. Check Radarr Activity for progress; downloads are not guaranteed.`
      )
      setSelected([])
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.')
      setConfirming(false)
    } finally {
      setSearching(false)
    }
  }
  return (
    <main>
      <header>
        <a className='brand' href='/'>
          Sortarr<span>Find your next short watch</span>
        </a>
        <button onClick={() => void refresh()} disabled={loading || searching}>
          {loading ? 'Connecting…' : 'Refresh library'}
        </button>
      </header>
      <section className='intro'>
        <div>
          <p className='source'>Your Radarr backlog</p>
          <h1>
            A little time.
            <br />A few more films.
          </h1>
          <p>
            Start with the shortest films you’re still missing.
            <br />
            Pick a batch and let Radarr find the releases.
          </p>
        </div>
        <aside>
          <strong>{data ? data.movies.length : '—'}</strong>
          <span>films still to download</span>
          <small>
            {data
              ? `Updated ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Connect Radarr to see your backlog'}
          </small>
        </aside>
      </section>
      <section className='library' aria-label='Missing films'>
        <div className='tabs' role='group' aria-label='Runtime groups'>
          {(
            [
              ['known', 'Known runtime'],
              ['unknown', `Unknown runtime (${unknown})`],
              ['all', 'All missing']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filters.runtime === value}
              disabled={searching}
              onClick={() => {
                setFilters((old) => ({ ...old, runtime: value, maxRuntime: 0 }))
                setSelected([])
                setConfirming(false)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <fieldset disabled={loading || searching}>
          <legend className='sr-only'>Filter missing films</legend>
          <div className='filters'>
            <label className='query'>
              Find a film
              <input
                type='search'
                placeholder='Search titles…'
                value={filters.query}
                onChange={(e) => change('query', e.target.value)}
              />
            </label>
            <label>
              Length
              <select
                value={filters.maxRuntime}
                onChange={(e) => change('maxRuntime', Number(e.target.value))}
                disabled={filters.runtime === 'unknown'}
              >
                <option value='0'>Any length</option>
                <option value='20'>20 minutes or less</option>
                <option value='40'>40 minutes or less</option>
                <option value='60'>60 minutes or less</option>
                <option value='90'>90 minutes or less</option>
              </select>
            </label>
            <label>
              Tag
              <select
                value={filters.tag}
                onChange={(e) => change('tag', Number(e.target.value))}
              >
                <option value='0'>All tags</option>
                {data?.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort by
              <select
                value={filters.order}
                onChange={(e) =>
                  change('order', e.target.value as Filters['order'])
                }
              >
                <option value='shortest'>Shortest first</option>
                <option value='longest'>Longest first</option>
                <option value='title'>Title A–Z</option>
              </select>
            </label>
          </div>
          <div className='toggles'>
            <label>
              <input
                type='checkbox'
                checked={filters.monitored}
                onChange={(e) => change('monitored', e.target.checked)}
              />
              Monitored only
            </label>
            <label>
              <input
                type='checkbox'
                checked={filters.available}
                onChange={(e) => change('available', e.target.checked)}
              />
              Available according to Radarr
            </label>
          </div>
        </fieldset>
        {filters.runtime === 'unknown' && (
          <p className='help'>
            These films have no usable runtime in Radarr. They are never counted
            as zero-minute films.
          </p>
        )}
        {error && (
          <p role='alert' className='error'>
            {error}
          </p>
        )}
        {notice && (
          <p role='status' className='notice'>
            {notice}
          </p>
        )}
        <div className='list-heading'>
          <span>
            {loading ? 'Reading Radarr…' : `${visible.length} films shown`}
          </span>
          <button
            disabled={loading || searching || !visible.length}
            onClick={() => setSelected(visible.slice(0, 20).map((m) => m.id))}
          >
            Select first {Math.min(visible.length, 20)}
          </button>
          <button
            disabled={!selected.length || searching}
            onClick={() => {
              setSelected([])
              setConfirming(false)
            }}
          >
            Clear selection
          </button>
        </div>
        {!loading && data && !visible.length && (
          <div className='empty'>
            <h2>No films match these filters</h2>
            <p>
              Try another runtime group, a longer duration, or include
              unmonitored films.
            </p>
            <button
              onClick={() => {
                setFilters({
                  ...defaults,
                  runtime: 'all',
                  monitored: false,
                  available: false
                })
                setSelected([])
              }}
            >
              Show all missing films
            </button>
          </div>
        )}
        {!!visible.length && (
          <div className='table-wrap'>
            <table>
              <thead>
                <tr>
                  <th>
                    <span className='sr-only'>Select</span>
                  </th>
                  <th>Film</th>
                  <th>Runtime</th>
                  <th className='details'>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((movie) => (
                  <tr
                    key={movie.id}
                    data-selected={selected.includes(movie.id)}
                  >
                    <td>
                      <input
                        aria-label={`Select ${movie.title}`}
                        type='checkbox'
                        disabled={
                          searching ||
                          (!selected.includes(movie.id) &&
                            selected.length >= 20)
                        }
                        checked={selected.includes(movie.id)}
                        onChange={(e) => {
                          setSelected((old) =>
                            e.target.checked
                              ? [...old, movie.id]
                              : old.filter((id) => id !== movie.id)
                          )
                          setConfirming(false)
                        }}
                      />
                    </td>
                    <td>
                      <strong>{movie.title}</strong>
                      <span className='film-meta'>
                        {movie.year || 'Year unknown'}
                        {movie.genres.length
                          ? ` · ${movie.genres.slice(0, 2).join(', ')}`
                          : ''}
                      </span>
                      <details>
                        <summary>Film details</summary>
                        <p>
                          {movie.overview || 'No synopsis available in Radarr.'}
                        </p>
                        <p>
                          {movie.tags
                            .map(
                              (id) => data?.tags.find((t) => t.id === id)?.label
                            )
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      </details>
                    </td>
                    <td className='runtime'>
                      {movie.runtime === null ? (
                        'Unknown'
                      ) : (
                        <>
                          {movie.runtime}
                          <small> min</small>
                        </>
                      )}
                    </td>
                    <td className='details'>
                      <span className='badge'>
                        {movie.monitored ? 'Monitored' : 'Unmonitored'}
                      </span>
                      <span className='film-meta'>
                        {movie.isAvailable ? 'Available' : 'Not yet available'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className='selection' aria-label='Selected films'>
        <div>
          <strong>{chosen.length} selected</strong>
          <span>
            {duration} min of known runtime
            {chosen.some((m) => m.runtime === null)
              ? ' · includes unknown runtimes'
              : ''}
          </span>
        </div>
        <button
          className='primary'
          disabled={!chosen.length || loading || searching || !data}
          onClick={() => setConfirming(true)}
        >
          Search selected in Radarr
        </button>
      </section>
      {confirming && (
        <section className='confirmation' aria-label='Confirm search'>
          <h2>
            Search for {chosen.length} film{chosen.length === 1 ? '' : 's'}?
          </h2>
          <p>
            Radarr may download matching releases automatically using your
            existing quality profiles. List order does not control download
            order.
          </p>
          <div>
            <button disabled={searching} onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button
              className='primary'
              disabled={searching}
              onClick={() => void searchSelected()}
            >
              {searching ? 'Submitting…' : 'Confirm search'}
            </button>
          </div>
        </section>
      )}
      <footer>
        Runtimes come from Radarr metadata. Availability means released
        according to Radarr, not a confirmed downloadable release. Up to 20
        films per search.
      </footer>
    </main>
  )
}
