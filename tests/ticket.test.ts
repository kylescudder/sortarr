import { expect, test } from 'bun:test'
import {
  FEET_PER_MINUTE_35MM,
  feetOf35mm,
  ticketSerial
} from '../shared/ticket'

test('35mm runs at exactly 90 ft a minute', () => {
  expect(FEET_PER_MINUTE_35MM).toBe(90)
  expect(feetOf35mm(1)).toBe(90)
  expect(feetOf35mm(13)).toBe(1170)
  expect(feetOf35mm(90)).toBe(8100)
})

test('the serial depends on the films, not the order they were picked', () => {
  const picked = ['From Dusk Til Dawn', 'Gimme Shelter', 'Tarantella']
  expect(ticketSerial(picked)).toBe(ticketSerial([...picked].reverse()))
  expect(ticketSerial(picked)).toBe(
    ticketSerial(picked.map((t) => t.toUpperCase()))
  )
  expect(ticketSerial(picked)).not.toBe(ticketSerial(['Tarantella']))
})

test('serials are always six zero-padded digits', () => {
  for (const titles of [[], ['Doodlebug'], ['A', 'B', 'C'], ['Quay']])
    expect(ticketSerial(titles)).toMatch(/^\d{6}$/)
  expect(
    ticketSerial(['From Dusk Til Dawn', 'Gimme Shelter', 'Tarantella'])
  ).toBe('481775')
})
