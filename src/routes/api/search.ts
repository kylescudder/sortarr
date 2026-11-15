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
          // Taken before Radarr sees the search: it can grab a release before
          // the ticket is stored, and that grab must still count.
          const searchedAt = new Date()
          const { movieIds, ...receipt } = await search(request)
          // Remembered so Sortarr can later say "No release found".
          await recordSearch(member.id, receipt.commandId, movieIds, searchedAt)
          return receipt
        })
    }
  }
})
