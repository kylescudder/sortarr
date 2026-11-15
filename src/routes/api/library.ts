import { createFileRoute } from '@tanstack/react-router'
import { library, respond } from '../../../server/radarr'
export const Route = createFileRoute('/api/library')({
  server: { handlers: { GET: () => respond(library) } }
})
