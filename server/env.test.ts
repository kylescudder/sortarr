import { expect, test } from 'bun:test'
import { readDatabaseEnv, readEnv } from '../src/server/env'

const valid = {
  DATABASE_URL: 'postgres://fixture:password@localhost:5432/app',
  APP_ORIGIN: 'https://sortarr.example.com',
  BETTER_AUTH_URL: 'https://sortarr.example.com',
  BETTER_AUTH_SECRET:
    'fixture-secret-that-is-longer-than-thirty-two-characters',
  BREVO_API_KEY: 'fixture-api-key',
  AUTH_EMAIL_FROM: 'sortarr@example.com',
  AUTH_ALLOWED_EMAILS: 'member@example.com'
}

test('valid runtime settings are typed and use the app defaults', () => {
  const env = readEnv(valid)
  expect(env.NODE_ENV).toBe('development')
  expect(env.AUTH_EMAIL_DAILY_LIMIT).toBe(40)
  expect(env.APP_ORIGIN).toBe(valid.APP_ORIGIN)
  expect(env.BETTER_AUTH_URL).toBe(valid.BETTER_AUTH_URL)
  expect(readEnv({ ...valid, AUTH_EMAIL_DAILY_LIMIT: '12' })).toMatchObject({
    AUTH_EMAIL_DAILY_LIMIT: 12
  })
  // A trailing slash is normalised to the bare origin on both settings.
  expect(
    readEnv({
      ...valid,
      APP_ORIGIN: valid.APP_ORIGIN + '/',
      BETTER_AUTH_URL: valid.BETTER_AUTH_URL + '/'
    }).BETTER_AUTH_URL
  ).toBe(valid.BETTER_AUTH_URL)
})

test('migrations need only a valid PostgreSQL URL', () => {
  expect(
    readDatabaseEnv({ DATABASE_URL: valid.DATABASE_URL }).DATABASE_URL
  ).toBe(valid.DATABASE_URL)
  for (const DATABASE_URL of [
    undefined,
    '',
    'not-a-url',
    'https://example.com/app',
    'postgres://localhost'
  ]) {
    expect(() => readDatabaseEnv({ DATABASE_URL })).toThrow('DATABASE_URL')
  }
})

test('unknown runtime modes are rejected before accepting requests', () => {
  expect(() => readEnv({ ...valid, NODE_ENV: 'staging' })).toThrow('NODE_ENV')
})

test('configuration errors identify fields without printing secret values', () => {
  const secret = 'do-not-print-this-password'
  for (const settings of [
    { DATABASE_URL: 'https://user:' + secret + '@example.com/app' },
    { BETTER_AUTH_SECRET: secret.slice(0, 10) },
    { AUTH_ALLOWED_EMAILS: secret },
    { BETTER_AUTH_URL: 'https://' + secret + '.example.com' },
    { APP_ORIGIN: 'https://user:' + secret + '@sortarr.example.com' }
  ]) {
    let message = ''
    try {
      readEnv({ ...valid, ...settings })
    } catch (error) {
      message = (error as Error).message
    }
    const [key] = Object.keys(settings)
    expect(message).toContain(key)
    expect(message).not.toContain(secret)
    expect(message).not.toContain(secret.slice(0, 10))
  }
})

test('Better Auth settings are required', () => {
  for (const key of [
    'APP_ORIGIN',
    'BETTER_AUTH_URL',
    'BETTER_AUTH_SECRET',
    'BREVO_API_KEY',
    'AUTH_EMAIL_FROM',
    'AUTH_ALLOWED_EMAILS'
  ]) {
    expect(() => readEnv({ ...valid, [key]: '' })).toThrow(key)
    expect(() => readEnv({ ...valid, [key]: undefined })).toThrow(key)
  }
  expect(() => readEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(
    'BETTER_AUTH_SECRET'
  )
  expect(() => readEnv({ ...valid, AUTH_EMAIL_FROM: 'not-an-email' })).toThrow(
    'AUTH_EMAIL_FROM'
  )
  for (const AUTH_EMAIL_DAILY_LIMIT of ['0', '301', '1.5', 'many'])
    expect(() => readEnv({ ...valid, AUTH_EMAIL_DAILY_LIMIT })).toThrow(
      'AUTH_EMAIL_DAILY_LIMIT'
    )
})

test('origins must be bare http(s) origins, and https in production', () => {
  for (const BETTER_AUTH_URL of [
    'ftp://sortarr.example.com',
    'https://sortarr.example.com/api/auth',
    'https://sortarr.example.com/?next=1',
    'https://user:pass@sortarr.example.com'
  ])
    expect(() =>
      readEnv({ ...valid, APP_ORIGIN: BETTER_AUTH_URL, BETTER_AUTH_URL })
    ).toThrow('BETTER_AUTH_URL')
  const local = {
    ...valid,
    APP_ORIGIN: 'http://localhost:3210',
    BETTER_AUTH_URL: 'http://localhost:3210'
  }
  expect(readEnv(local).BETTER_AUTH_URL).toBe('http://localhost:3210')
  expect(() => readEnv({ ...local, NODE_ENV: 'production' })).toThrow(
    'BETTER_AUTH_URL'
  )
  expect(readEnv({ ...valid, NODE_ENV: 'production' }).NODE_ENV).toBe(
    'production'
  )
})

test('APP_ORIGIN and BETTER_AUTH_URL must name the same origin', () => {
  for (const BETTER_AUTH_URL of [
    'https://auth.sortarr.example.com',
    'http://sortarr.example.com',
    'https://sortarr.example.com:8443'
  ])
    expect(() => readEnv({ ...valid, BETTER_AUTH_URL })).toThrow(
      'BETTER_AUTH_URL'
    )
})

test('retired provider settings left in the host .env are ignored', () => {
  const env = readEnv({
    ...valid,
    AUTH_PROVIDER: 'retired-provider',
    RETIRED_PROVIDER_SECRET_KEY: 'leftover'
  })
  expect(env.BETTER_AUTH_URL).toBe(valid.BETTER_AUTH_URL)
  expect('AUTH_PROVIDER' in env).toBe(false)
})

test('allowed emails are validated, normalized and never empty', () => {
  const env = readEnv({
    ...valid,
    AUTH_ALLOWED_EMAILS: ' Member@example.com, second@example.com ,'
  })
  expect(env.AUTH_ALLOWED_EMAILS).toEqual([
    'member@example.com',
    'second@example.com'
  ])
  for (const AUTH_ALLOWED_EMAILS of [' , ', 'invalid', 'member@example.com,x'])
    expect(() => readEnv({ ...valid, AUTH_ALLOWED_EMAILS })).toThrow(
      'AUTH_ALLOWED_EMAILS'
    )
})
