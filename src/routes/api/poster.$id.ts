import { createFileRoute } from '@tanstack/react-router'
import { ApiError, poster, respond } from '../../../server/radarr'
import { requireMember } from '@/server/auth'

export const Route = createFileRoute('/api/poster/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          await requireMember(request)
          const id = Number(params.id)
          if (!Number.isInteger(id) || id <= 0)
            throw new ApiError('Unknown film.', 404)
          const width =
            new URL(request.url).searchParams.get('size') === '500' ? 500 : 250
          return await poster(id, width)
        } catch (error) {
          // Same JSON errors (and no-store) as the other API routes.
          return respond(() => Promise.reject(error))
        }
      }
    }
  }
})
