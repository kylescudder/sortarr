// One tier: an address on AUTH_ALLOWED_EMAILS may use Sortarr. Checked when a
// user is created and on every server authorization, so removing an address
// revokes access on the next request.
export function isVerifiedMember(
  user: { email: string; emailVerified: boolean } | null | undefined,
  allowedEmails: readonly string[]
) {
  return (
    !!user?.emailVerified &&
    allowedEmails.includes(user.email.trim().toLowerCase())
  )
}

export function isAllowedEmail(
  email: string,
  allowedEmails: readonly string[]
) {
  return allowedEmails.includes(email.trim().toLowerCase())
}
