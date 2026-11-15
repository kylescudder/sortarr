import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

// Confirmed on the server, so a just-signed-in browser never bounces back to
// sign-in while the client session store catches up.
export const getViewer = createServerFn({ method: 'GET' }).handler(async () => {
  const { getMember } = await import('@/server/auth')
  const member = await getMember(getRequestHeaders())
  return member ? { name: member.name, email: member.email } : null
})
