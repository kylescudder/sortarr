import { createFileRoute } from '@tanstack/react-router'
import { search, respond } from '../../../server/radarr'
import { requireMember } from '@/server/auth'
import { recordSearch } from '@/server/searches'

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      POST: ({ request }) =>
        respond(async () => {
          const member = await requireMember(request)
          const { movieIds, ...receipt } = await search(request)
          // Remembered so Sortarr can later say "No release found".
          await recordSearch(member.id, receipt.commandId, movieIds)
          return receipt
        })
    }
  }
})
