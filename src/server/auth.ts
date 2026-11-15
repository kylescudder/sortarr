import '@tanstack/react-start/server-only'
import { db } from './db'
import { readEnv } from './env'
import { createSortarrAuth } from './auth-factory'
import { sendLinkEmail, sendLoginEmail } from './auth-email'
import { isVerifiedMember } from './auth-policy'
import { ApiError } from '../../server/errors'

let instance: ReturnType<typeof createSortarrAuth> | undefined

export function getBetterAuth() {
  if (instance) return instance
  const env = readEnv()
  const mail = { apiKey: env.BREVO_API_KEY, from: env.AUTH_EMAIL_FROM }
  instance = createSortarrAuth(
    db,
    {
      baseURL: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
      allowedEmails: env.AUTH_ALLOWED_EMAILS,
      dailyEmailLimit: env.AUTH_EMAIL_DAILY_LIMIT
    },
    (email, otp) => sendLoginEmail(mail, env.BETTER_AUTH_URL, email, otp),
    (email, kind, url) =>
      sendLinkEmail(mail, env.BETTER_AUTH_URL, email, kind, url)
  )
  return instance
}

// The signed-in member for this request, or null. The session's email must be
// verified and still allowlisted, so removing an address revokes access at once.
export async function getMember(headers: Headers) {
  const session = await getBetterAuth().api.getSession({ headers })
  return isVerifiedMember(session?.user, readEnv().AUTH_ALLOWED_EMAILS)
    ? session!.user
    : null
}

export async function requireMember(request: Request) {
  const member = await getMember(request.headers)
  if (!member) throw new ApiError('Sign in to use Sortarr.', 401)
  return member
}
