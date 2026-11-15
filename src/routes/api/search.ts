import { createFileRoute } from '@tanstack/react-router'
import { search, respond } from '../../../server/radarr'
export const Route = createFileRoute('/api/search')({
  server: {
    handlers: { POST: ({ request }) => respond(() => search(request)) }
  }
})
