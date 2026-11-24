import { boolean, index, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { id, timestamps, ts } from './_common'

export const salesChannel = pgTable('sales_channel', {
  id: id('sc'),
  name: text('name').notNull(),
  description: text('description'),
  isDisabled: boolean('is_disabled').notNull().default(false),
  ...timestamps,
})

/**
 * Publishable keys store the token in plaintext (they are public by design).
 * Secret keys store only a SHA-256 hash plus the last 4 characters.
 */
export const apiKey = pgTable(
  'api_key',
  {
    id: id('apk'),
    title: text('title').notNull(),
    type: text('type', { enum: ['publishable', 'secret'] }).notNull(),
    token: text('token').notNull().unique(),
    redacted: text('redacted').notNull(),
    createdBy: text('created_by'),
    lastUsedAt: ts('last_used_at'),
    revokedAt: ts('revoked_at'),
    revokedBy: text('revoked_by'),
    ...timestamps,
  },
  (t) => [index('api_key_type_idx').on(t.type)],
)

export const apiKeySalesChannel = pgTable(
  'api_key_sales_channel',
  {
    apiKeyId: text('api_key_id')
      .notNull()
      .references(() => apiKey.id, { onDelete: 'cascade' }),
    salesChannelId: text('sales_channel_id')
      .notNull()
      .references(() => salesChannel.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.salesChannelId] })],
)
