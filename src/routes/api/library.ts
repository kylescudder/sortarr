import { createFileRoute } from '@tanstack/react-router'
import { library, respond } from '../../../server/radarr'
import { requireMember } from '@/server/auth'

export const Route = createFileRoute('/api/library')({
  server: {
    handlers: {
      GET: ({ request }) =>
        respond(async () => {
          await requireMember(request)
          return library()
        })
    }
  }
})
