import { expect, test } from 'bun:test'
import { readOriginEnv, readRadarrEnv } from '../server/env'
import { ApiError } from '../server/errors'

const failure = (read: () => unknown) => {
  try {
    read()
  } catch (error) {
    return error as ApiError
  }
  throw new Error('expected a configuration error')
}

test('a missing key names the setting without stopping the server', () => {
  const error = failure(() =>
    readRadarrEnv({ RADARR_URL: 'http://radarr:7878', RADARR_API_KEY: '' })
  )
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBe(503)
  expect(error.message).toContain('RADARR_API_KEY')
})

test('a Radarr URL with credentials is rejected without echoing it', () => {
  const error = failure(() =>
    readRadarrEnv({
      RADARR_URL: 'http://user:secret-value@radarr:7878',
      RADARR_API_KEY: 'key'
    })
  )
  expect(error.message).toContain('RADARR_URL')
  expect(error.message).not.toContain('secret-value')
})

test('Radarr URL keeps its URL base and drops trailing slashes', () => {
  expect(
    readRadarrEnv({
      RADARR_URL: 'http://radarr:7878/radarr/',
      RADARR_API_KEY: ' key '
    })
  ).toEqual({ RADARR_URL: 'http://radarr:7878/radarr', RADARR_API_KEY: 'key' })
})

test('APP_ORIGIN is optional and normalised to an origin', () => {
  expect(readOriginEnv({}).APP_ORIGIN).toBeUndefined()
  expect(
    readOriginEnv({ APP_ORIGIN: 'https://sortarr.thescudders.org/' }).APP_ORIGIN
  ).toBe('https://sortarr.thescudders.org')
})
