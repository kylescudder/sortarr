import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CircleAlertIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { filterMovies, type Filters, type Library } from '../../shared/movies'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

export const Route = createFileRoute('/')({ component: Backlog })

const MAX_SELECTION = 20
const defaults: Filters = {
  query: '',
  maxRuntime: 0,
  runtime: 'known',
  monitored: true,
  available: true,
  tag: 0,
  order: 'shortest'
}

interface SearchReceipt {
  commandId: number
  status: string
  count: number
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const result = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(result.error || 'The request failed. Try again.')
  return result as T
}

function Backlog() {
  const [filters, setFilters] = useState<Filters>(defaults)
  const [selected, setSelected] = useState<number[]>([])
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')

  const library = useQuery({
    queryKey: ['library'],
    queryFn: () => api<Library>('/api/library')
  })
  const search = useMutation({
    mutationFn: (movieIds: number[]) =>
      api<SearchReceipt>('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieIds })
      }),
    onMutate: () => setNotice(''),
    onSuccess: (result) => {
      setNotice(
        `Search accepted for ${result.count} film${result.count === 1 ? '' : 's'}. Radarr command #${result.commandId}. Check Radarr Activity for progress; downloads are not guaranteed.`
      )
      setSelected([])
    },
    onSettled: () => setConfirming(false)
  })

  const data = library.data
  const loading = library.isFetching
  const busy = loading || search.isPending
  const error = library.error?.message || search.error?.message
  const visible = filterMovies(data?.movies ?? [], filters)
  const unknown = data?.movies.filter((m) => m.runtime === null).length ?? 0
  const chosen = visible.filter((m) => selected.includes(m.id))
  const duration = chosen.reduce((total, m) => total + (m.runtime ?? 0), 0)
  const tagLabel = (id: number) => data?.tags.find((t) => t.id === id)?.label

  function update(next: Partial<Filters>) {
    setFilters((old) => ({ ...old, ...next }))
    setSelected([])
    setConfirming(false)
    setNotice('')
  }
  function refresh() {
    update({})
    search.reset()
    void library.refetch()
  }

  return (
    <main className='mx-auto max-w-6xl px-4 pb-32 sm:px-10'>
      <header className='flex items-center justify-between gap-4 border-b py-6'>
        <a href='/' className='flex flex-col leading-tight'>
          <span className='text-2xl font-extrabold tracking-tight'>
            Sortarr
          </span>
          <span className='text-muted-foreground text-sm'>
            Find your next short watch
          </span>
        </a>
        <Button variant='outline' onClick={refresh} disabled={busy}>
          {loading ? <Spinner /> : <RefreshCwIcon />}
          {loading ? 'Connecting…' : 'Refresh library'}
        </Button>
      </header>

      <section className='grid gap-6 py-10 md:grid-cols-[1fr_auto] md:items-end'>
        <div>
          <p className='text-muted-foreground text-sm font-semibold tracking-wide uppercase'>
            Your Radarr backlog
          </p>
          <h1 className='mt-2 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl'>
            A little time.
            <br />A few more films.
          </h1>
          <p className='text-muted-foreground mt-4 max-w-prose'>
            Start with the shortest films you’re still missing. Pick a batch and
            let Radarr find the releases.
          </p>
        </div>
        <Card className='min-w-56 gap-1 px-6 py-5'>
          <strong className='text-4xl font-extrabold tabular-nums'>
            {data ? data.movies.length : '—'}
          </strong>
          <span>films still to download</span>
          <small className='text-muted-foreground'>
            {data
              ? `Updated ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Connect Radarr to see your backlog'}
          </small>
        </Card>
      </section>

      <section aria-label='Missing films' className='flex flex-col gap-5'>
        <div
          role='group'
          aria-label='Runtime groups'
          className='flex flex-wrap gap-2'
        >
          {(
            [
              ['known', 'Known runtime'],
              ['unknown', `Unknown runtime (${unknown})`],
              ['all', 'All missing']
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={filters.runtime === value ? 'default' : 'outline'}
              aria-pressed={filters.runtime === value}
              disabled={search.isPending}
              onClick={() => update({ runtime: value, maxRuntime: 0 })}
            >
              {label}
            </Button>
          ))}
        </div>

        <fieldset disabled={busy} className='flex flex-col gap-4'>
          <legend className='sr-only'>Filter missing films</legend>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]'>
            <Field id='query' label='Find a film'>
              <Input
                id='query'
                type='search'
                placeholder='Search titles…'
                value={filters.query}
                onChange={(e) => update({ query: e.target.value })}
              />
            </Field>
            <Field id='length' label='Length'>
              <Choice
                id='length'
                value={String(filters.maxRuntime)}
                disabled={busy || filters.runtime === 'unknown'}
                onChange={(value) => update({ maxRuntime: Number(value) })}
                options={[
                  ['0', 'Any length'],
                  ['20', '20 minutes or less'],
                  ['40', '40 minutes or less'],
                  ['60', '60 minutes or less'],
                  ['90', '90 minutes or less']
                ]}
              />
            </Field>
            <Field id='tag' label='Tag'>
              <Choice
                id='tag'
                value={String(filters.tag)}
                disabled={busy}
                onChange={(value) => update({ tag: Number(value) })}
                options={[
                  ['0', 'All tags'],
                  ...(data?.tags.map((t) => [String(t.id), t.label] as const) ??
                    [])
                ]}
              />
            </Field>
            <Field id='order' label='Sort by'>
              <Choice
                id='order'
                value={filters.order}
                disabled={busy}
                onChange={(value) =>
                  update({ order: value as Filters['order'] })
                }
                options={[
                  ['shortest', 'Shortest first'],
                  ['longest', 'Longest first'],
                  ['title', 'Title A–Z']
                ]}
              />
            </Field>
          </div>
          <div className='flex flex-wrap gap-x-6 gap-y-3'>
            <Toggle
              id='monitored'
              label='Monitored only'
              checked={filters.monitored}
              onChange={(monitored) => update({ monitored })}
            />
            <Toggle
              id='available'
              label='Available according to Radarr'
              checked={filters.available}
              onChange={(available) => update({ available })}
            />
          </div>
        </fieldset>

        {filters.runtime === 'unknown' && (
          <p className='text-muted-foreground text-sm'>
            These films have no usable runtime in Radarr. They are never counted
            as zero-minute films.
          </p>
        )}
        {error && (
          <Alert variant='destructive'>
            <CircleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <p
            role='status'
            className='bg-accent text-accent-foreground rounded-lg border px-4 py-3 text-sm'
          >
            {notice}
          </p>
        )}

        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground mr-auto text-sm'>
            {loading ? 'Reading Radarr…' : `${visible.length} films shown`}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={busy || !visible.length}
            onClick={() =>
              setSelected(visible.slice(0, MAX_SELECTION).map((m) => m.id))
            }
          >
            Select first {Math.min(visible.length, MAX_SELECTION)}
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={!selected.length || search.isPending}
            onClick={() => setSelected([])}
          >
            Clear selection
          </Button>
        </div>

        {!loading && data && !visible.length && (
          <Empty className='border'>
            <EmptyHeader>
              <EmptyTitle>
                <h2>No films match these filters</h2>
              </EmptyTitle>
              <EmptyDescription>
                Try another runtime group, a longer duration, or include
                unmonitored films.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={() =>
                  update({
                    ...defaults,
                    runtime: 'all',
                    monitored: false,
                    available: false
                  })
                }
              >
                Show all missing films
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {!!visible.length && (
          <Card className='overflow-x-auto p-0'>
            <table className='w-full text-left text-sm'>
              <thead className='bg-muted/60 text-muted-foreground border-b text-xs tracking-wide uppercase'>
                <tr>
                  <th className='w-12 px-4 py-3'>
                    <span className='sr-only'>Select</span>
                  </th>
                  <th className='px-2 py-3'>Film</th>
                  <th className='px-4 py-3 text-right'>Runtime</th>
                  <th className='hidden px-4 py-3 md:table-cell'>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((movie) => {
                  const isSelected = selected.includes(movie.id)
                  return (
                    <tr
                      key={movie.id}
                      data-selected={isSelected}
                      className='data-[selected=true]:bg-accent/60 border-b align-top last:border-0'
                    >
                      <td className='px-4 py-3'>
                        <Checkbox
                          aria-label={`Select ${movie.title}`}
                          disabled={
                            search.isPending ||
                            (!isSelected && selected.length >= MAX_SELECTION)
                          }
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            setSelected((old) =>
                              checked === true
                                ? [...old, movie.id]
                                : old.filter((id) => id !== movie.id)
                            )
                            setConfirming(false)
                          }}
                        />
                      </td>
                      <td className='px-2 py-3'>
                        <strong className='block font-semibold'>
                          {movie.title}
                        </strong>
                        <span className='text-muted-foreground'>
                          {movie.year || 'Year unknown'}
                          {movie.genres.length
                            ? ` · ${movie.genres.slice(0, 2).join(', ')}`
                            : ''}
                        </span>
                        <details className='text-muted-foreground mt-1'>
                          <summary className='cursor-pointer text-xs'>
                            Film details
                          </summary>
                          <p className='mt-1 max-w-prose'>
                            {movie.overview ||
                              'No synopsis available in Radarr.'}
                          </p>
                          <p>
                            {movie.tags
                              .map(tagLabel)
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        </details>
                      </td>
                      <td className='px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums'>
                        {movie.runtime === null ? (
                          'Unknown'
                        ) : (
                          <>
                            {movie.runtime}
                            <small className='text-muted-foreground font-normal'>
                              {' '}
                              min
                            </small>
                          </>
                        )}
                      </td>
                      <td className='hidden px-4 py-3 md:table-cell'>
                        <div className='flex flex-col items-start gap-1'>
                          <Badge
                            variant={movie.monitored ? 'secondary' : 'outline'}
                          >
                            {movie.monitored ? 'Monitored' : 'Unmonitored'}
                          </Badge>
                          <span className='text-muted-foreground'>
                            {movie.isAvailable
                              ? 'Available'
                              : 'Not yet available'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section
        aria-label='Selected films'
        className='bg-card/95 fixed inset-x-0 bottom-0 border-t backdrop-blur'
      >
        <div className='mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-10'>
          <div className='flex flex-col'>
            <strong>{chosen.length} selected</strong>
            <span className='text-muted-foreground text-sm'>
              {duration} min of known runtime
              {chosen.some((m) => m.runtime === null)
                ? ' · includes unknown runtimes'
                : ''}
            </span>
          </div>
          <Button
            disabled={!chosen.length || busy || !data}
            onClick={() => setConfirming(true)}
          >
            <SearchIcon />
            Search selected in Radarr
          </Button>
        </div>
      </section>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !search.isPending && setConfirming(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Search for {chosen.length} film{chosen.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Radarr may download matching releases automatically using your
              existing quality profiles. List order does not control download
              order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={search.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={search.isPending}
              onClick={() => search.mutate(chosen.map((m) => m.id))}
            >
              {search.isPending && <Spinner />}
              {search.isPending ? 'Submitting…' : 'Confirm search'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <footer className='text-muted-foreground pt-10 text-sm'>
        Runtimes come from Radarr metadata. Availability means released
        according to Radarr, not a confirmed downloadable release. Up to{' '}
        {MAX_SELECTION} films per search.
      </footer>
    </main>
  )
}

function Field({
  id,
  label,
  children
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className='flex flex-col gap-2'>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function Choice({
  id,
  value,
  disabled,
  onChange,
  options
}: {
  id: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
  options: readonly (readonly [string, string])[]
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className='bg-card w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, label]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Toggle({
  id,
  label,
  checked,
  onChange
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className='flex items-center gap-2'>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}
