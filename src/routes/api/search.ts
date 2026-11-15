import { createFileRoute } from '@tanstack/react-router'
import { search, respond } from '../../../server/radarr'
import { requireMember } from '@/server/auth'

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      POST: ({ request }) =>
        respond(async () => {
          await requireMember(request)
          return search(request)
        })
    }
  }
})
