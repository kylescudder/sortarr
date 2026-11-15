import { createFileRoute } from '@tanstack/react-router'
import { activity, respond } from '../../../server/radarr'
import { requireMember } from '@/server/auth'
import { recentSearches } from '@/server/searches'

export const Route = createFileRoute('/api/status')({
  server: {
    handlers: {
      GET: ({ request }) =>
        respond(async () => {
          await requireMember(request)
          return {
            statuses: await activity(await recentSearches()),
            checkedAt: new Date().toISOString()
          }
        })
    }
  }
})
