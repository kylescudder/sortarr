import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { CircleAlertIcon } from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { filterMovies, type Filters, type Library } from '../../shared/movies'
import { ACTIVE_STATES, type StatusMap } from '../../shared/status'
import { Marquee } from '@/components/picture-house/marquee'
import { Reel } from '@/components/picture-house/reel'
import { Ticket } from '@/components/picture-house/ticket'
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
import { Button } from '@/components/ui/button'
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
import { getViewer } from '@/lib/viewer'

const UserMenu = lazy(() =>
  import('@/components/BetterAuthUserMenu').then((m) => ({
    default: m.BetterAuthUserMenu
  }))
)

export const Route = createFileRoute('/')({
  // The whole app is for allowlisted members; confirm on the server first.
  beforeLoad: async ({ location }) => {
    if (!(await getViewer()))
      throw redirect({
        href: `/auth/sign-in?redirectTo=${encodeURIComponent(location.href)}`
      })
  },
  component: Backlog
})

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
  // A session that expired or lost its allowlisting goes back to sign-in.
  if (response.status === 401) {
    window.location.assign('/auth/sign-in?redirectTo=%2F')
    throw new Error('Sign in to use Sortarr.')
  }
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

  const queryClient = useQueryClient()
  const library = useQuery({
    queryKey: ['library'],
    queryFn: () => api<Library>('/api/library')
  })
  // What Radarr is doing, read live so it survives a refresh and shows the
  // same on every device: every 5 s while anything is moving, else every minute.
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () =>
      api<{ statuses: StatusMap; checkedAt: string }>('/api/status'),
    refetchInterval: (query) =>
      Object.values(query.state.data?.statuses ?? {}).some((s) =>
        ACTIVE_STATES.includes(s.state)
      )
        ? 5000
        : 60000
  })
  const statuses = status.data?.statuses ?? {}
  const activeIds = Object.entries(statuses)
    .filter(([, s]) => ACTIVE_STATES.includes(s.state))
    .map(([id]) => id)
  const active = activeIds.join(',')
  // When a film stops moving (usually because Radarr imported it), reload the
  // backlog so it drops off the list.
  const previousActive = useRef<string[]>([])
  useEffect(() => {
    const now = active ? active.split(',') : []
    if (previousActive.current.some((id) => !now.includes(id)))
      void queryClient.invalidateQueries({ queryKey: ['library'] })
    previousActive.current = now
  }, [active, queryClient])
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
        `Search accepted for ${result.count} film${result.count === 1 ? '' : 's'}. Radarr command #${result.commandId}. Progress shows on each film below; downloads are not guaranteed.`
      )
      setSelected([])
      void queryClient.invalidateQueries({ queryKey: ['status'] })
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
  // The marquee features the shortest film Radarr isn't already working on.
  const feature =
    visible.find((m) => {
      const state = statuses[m.id]?.state
      return !state || state === 'not-found' || state === 'attention'
    }) ?? visible[0]
  const tagLabel = (id: number) => data?.tags.find((t) => t.id === id)?.label

  function update(next: Partial<Filters>) {
    setFilters((old) => ({ ...old, ...next }))
    setSelected([])
    setConfirming(false)
    setNotice('')
  }
  function toggle(id: number, picked: boolean) {
    setSelected((old) =>
      picked ? [...old, id] : old.filter((other) => other !== id)
    )
    setConfirming(false)
  }
  function refresh() {
    update({})
    search.reset()
    void library.refetch()
  }

  return (
    <main
      className={`mx-auto max-w-[980px] px-3.5 sm:px-8 ${chosen.length ? 'pb-56' : 'pb-16'}`}
    >
      <Marquee
        feature={feature}
        remaining={data?.movies.filter((m) => m.runtime !== null).length}
        loading={loading}
        busy={busy}
        picked={!!feature && selected.includes(feature.id)}
        onPick={() =>
          feature && toggle(feature.id, !selected.includes(feature.id))
        }
        onRefresh={refresh}
        menu={
          <Suspense fallback={<span className='size-9' />}>
            <UserMenu />
          </Suspense>
        }
      />

      <section aria-label='Filters' className='mb-4 flex flex-col gap-4'>
        <div className='flex flex-wrap items-baseline gap-x-5.5 gap-y-2'>
          <h2 className='font-display text-lamp mr-3 text-3xl font-black tracking-[0.03em]'>
            The reel
          </h2>
          <div
            role='group'
            aria-label='Runtime groups'
            className='flex flex-wrap gap-x-5.5 gap-y-1'
          >
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
                disabled={search.isPending}
                onClick={() => update({ runtime: value, maxRuntime: 0 })}
                className='text-muted-foreground aria-pressed:border-lamp aria-pressed:text-foreground border-b-2 border-transparent py-1 text-[15px]'
              >
                {label}
              </button>
            ))}
          </div>
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
                className='bg-deep'
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
          <div className='flex flex-wrap items-center gap-x-6 gap-y-3'>
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
            <span className='ml-auto flex gap-4 text-sm'>
              <button
                disabled={busy || !visible.length}
                onClick={() =>
                  setSelected(visible.slice(0, MAX_SELECTION).map((m) => m.id))
                }
                className='text-muted-foreground hover:text-foreground underline-offset-4 hover:underline disabled:opacity-50'
              >
                Select first {Math.min(visible.length, MAX_SELECTION)}
              </button>
              <button
                disabled={!selected.length || search.isPending}
                onClick={() => setSelected([])}
                className='text-muted-foreground hover:text-foreground underline-offset-4 hover:underline disabled:opacity-50'
              >
                Clear selection
              </button>
            </span>
          </div>
        </fieldset>

        {filters.runtime === 'unknown' && (
          <p className='text-muted-foreground text-sm'>
            These films have no usable runtime in Radarr. They are never counted
            as zero-minute films.
          </p>
        )}
        {error && (
          <Alert variant='destructive' className='border-destructive/40'>
            <CircleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <p
            role='status'
            className='border-lamp/50 bg-lamp/10 rounded-lg border px-4 py-3 text-sm'
          >
            {notice}
          </p>
        )}
        <p className='text-muted-foreground text-sm'>
          {loading ? (
            <span className='inline-flex items-center gap-2'>
              <Spinner className='size-3.5' />
              Reading Radarr…
            </span>
          ) : (
            `${visible.length} films shown${activeIds.length ? `, ${activeIds.length} searching or downloading` : ''}`
          )}
        </p>
      </section>

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
        <Reel
          films={visible}
          selected={selected}
          tagLabel={tagLabel}
          limitReached={selected.length >= MAX_SELECTION}
          disabled={search.isPending}
          onToggle={toggle}
          statuses={statuses}
          now={status.data ? Date.parse(status.data.checkedAt) : undefined}
        />
      )}

      <footer className='text-muted-foreground pt-10 text-sm'>
        Runtimes come from Radarr metadata. Availability means released
        according to Radarr, not a confirmed downloadable release. Up to{' '}
        {MAX_SELECTION} films per search.
      </footer>

      {!!chosen.length && (
        <Ticket
          films={chosen}
          disabled={busy || !data}
          onSearch={() => setConfirming(true)}
        />
      )}

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
      <Label htmlFor={id} className='text-muted-foreground'>
        {label}
      </Label>
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
      <SelectTrigger id={id} className='bg-deep w-full'>
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
