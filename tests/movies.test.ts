import { test, expect } from 'bun:test'
import { filterMovies, type Movie, type Filters } from '../shared/movies'
const filters: Filters = {
  query: '',
  maxRuntime: 0,
  runtime: 'all',
  monitored: false,
  available: false,
  tag: 0,
  order: 'shortest'
}
const movie = (id: number, runtime: number | null): Movie => ({
  id,
  title: `Film ${id}`,
  year: 2000,
  runtime,
  monitored: true,
  isAvailable: true,
  tags: [],
  genres: [],
  overview: '',
  status: 'released',
  hasPoster: false
})
test('unknown durations sort last in both numeric directions', () => {
  const movies = [movie(1, null), movie(2, 90), movie(3, 3)]
  expect(filterMovies(movies, filters).map((m) => m.id)).toEqual([3, 2, 1])
  expect(
    filterMovies(movies, { ...filters, order: 'longest' }).map((m) => m.id)
  ).toEqual([2, 3, 1])
  expect(movies[0].id).toBe(1)
})
test('a runtime ceiling excludes unknown durations', () => {
  expect(
    filterMovies([movie(1, null), movie(2, 40), movie(3, 41)], {
      ...filters,
      maxRuntime: 40
    }).map((m) => m.id)
  ).toEqual([2])
})
