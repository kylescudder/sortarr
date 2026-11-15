import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core'
import { authUser } from './auth-schema'

// One row per "Search selected in Radarr". Radarr doesn't record searches that
// find nothing, so this is how Sortarr can say "No release found" later, and
// who sent each ticket.
export const searchRequest = pgTable(
  'search_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    commandId: integer('command_id').notNull(),
    movieIds: integer('movie_ids').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [index('search_request_created_idx').on(table.createdAt)]
)
