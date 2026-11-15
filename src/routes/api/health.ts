import { createFileRoute } from '@tanstack/react-router'
import { revision } from '../../../server/revision'
// Liveness only: never calls Radarr, so a Radarr outage cannot fail a deploy.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { status: 'ok', revision: revision() },
          { headers: { 'Cache-Control': 'no-store' } }
        )
    }
  }
})
