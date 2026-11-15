import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'
import { ApiError } from './errors'

type RuntimeEnv = Record<string, string | undefined>

const baseUrl = z.url().refine((value) => {
  const url = new URL(value)
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  )
})

const validation = {
  emptyStringAsUndefined: true,
  onValidationError(issues: readonly { path?: readonly unknown[] }[]): never {
    // Report setting names only; credentials must never reach the browser or logs.
    throw new ApiError(
      `Check ${issues.map((issue) => issue.path?.join('.')).join(', ')} on the server, then restart Sortarr.`,
      503
    )
  }
}

// Read on each request, so a missing Radarr key shows in the app instead of
// stopping the container (and the rest of the udms stack's `compose up`).
export function readRadarrEnv(runtimeEnv: RuntimeEnv = process.env) {
  return createEnv({
    server: {
      RADARR_URL: baseUrl.transform((value) => value.replace(/\/+$/, '')),
      RADARR_API_KEY: z.string().trim().min(1)
    },
    runtimeEnv,
    ...validation
  })
}

// Behind Cloudflare Tunnel the container sees plain HTTP, so production pins
// the browser's https origin for the search CSRF check.
export function readOriginEnv(runtimeEnv: RuntimeEnv = process.env) {
  return createEnv({
    server: {
      APP_ORIGIN: baseUrl.transform((value) => new URL(value).origin).optional()
    },
    runtimeEnv,
    ...validation
  })
}
