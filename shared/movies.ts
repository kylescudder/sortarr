export interface Movie {
  id: number
  title: string
  year: number
  runtime: number | null
  monitored: boolean
  isAvailable: boolean
  tags: number[]
  genres: string[]
  overview: string
  status: string
}
export interface Library {
  movies: Movie[]
  tags: { id: number; label: string }[]
  fetchedAt: string
}
export interface Filters {
  query: string
  maxRuntime: number
  runtime: 'known' | 'unknown' | 'all'
  monitored: boolean
  available: boolean
  tag: number
  order: 'shortest' | 'longest' | 'title'
}
export function filterMovies(movies: Movie[], filters: Filters) {
  return movies
    .filter(
      (m) =>
        (!filters.query ||
          m.title
            .toLocaleLowerCase()
            .includes(filters.query.toLocaleLowerCase())) &&
        (!filters.monitored || m.monitored) &&
        (!filters.available || m.isAvailable) &&
        (!filters.tag || m.tags.includes(filters.tag)) &&
        (filters.runtime === 'all' ||
          (filters.runtime === 'unknown'
            ? m.runtime === null
            : m.runtime !== null)) &&
        (!filters.maxRuntime ||
          (m.runtime !== null && m.runtime <= filters.maxRuntime))
    )
    .sort((a, b) =>
      filters.order === 'title'
        ? a.title.localeCompare(b.title)
        : a.runtime === null
          ? b.runtime === null
            ? a.title.localeCompare(b.title)
            : 1
          : b.runtime === null
            ? -1
            : (filters.order === 'shortest'
                ? a.runtime - b.runtime
                : b.runtime - a.runtime) || a.title.localeCompare(b.title)
    )
}
