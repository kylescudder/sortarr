import { expect, test } from 'bun:test'
import { renderCodeEmail, renderLinkEmail } from '../src/server/auth-email'

const origin = 'https://sortarr.auth.test'

test('auth emails are branded, escape links and only link to this site', () => {
  const code = renderCodeEmail(origin, '123456')
  expect(code.subject).toBe('123456 is your Sortarr sign-in code')
  expect(code.html).toContain(`src="${origin}/email-logo.png"`)
  expect(code.html).toContain('>Sortarr</td>')
  expect(code.html).toContain('Enter this code to sign in to Sortarr.')
  expect(code.html).toContain('>123456<')
  expect(code.html).not.toContain('Suggestions')
  expect(code.text).toContain('Your Sortarr sign-in code is 123456.')
  expect(() => renderCodeEmail(origin, '12345<')).toThrow()

  const url = `${origin}/api/auth/magic-link/verify?token=abc&callbackURL=%2F"x`
  const link = renderLinkEmail(origin, 'magic-link', url)
  expect(link.subject).toBe('Your Sortarr sign-in link')
  expect(link.html).toContain('Sign in to Sortarr')
  // URL parsing percent-encodes the quote; & is HTML-escaped in attributes.
  expect(link.html).toContain('token=abc&amp;callbackURL=%2F%22x')
  expect(link.html).not.toContain('callbackURL=%2F"x')
  expect(link.text).toContain(new URL(url).href)

  const reset = renderLinkEmail(
    origin,
    'reset-password',
    `${origin}/api/auth/reset-password/t`
  )
  expect(reset.subject).toBe('Set your Sortarr password')
  expect(reset.html).toContain('30 minutes')

  expect(() =>
    renderLinkEmail(origin, 'magic-link', 'https://attacker.example/verify')
  ).toThrow('Unexpected sign-in link origin')
})
