import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

import { readDatabaseEnv } from './env'

const env = readDatabaseEnv()

// postgres.js v4 retries a connection the server refuses for too many
// connections (53300) until connect_timeout has passed. 2 seconds makes such a
// refusal fail in about 3 seconds instead of leaving requests waiting.
export const databaseOptions = {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 2,
  onnotice: () => {}
}

export const sql = postgres(env.DATABASE_URL, databaseOptions)

export const db = drizzle(sql, { schema })
