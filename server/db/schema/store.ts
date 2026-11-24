import { boolean, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { id, timestamps, type Metadata } from './_common'

export const currency = pgTable('currency', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  decimals: integer('decimals').notNull().default(2),
})

export const store = pgTable('store', {
  id: id('store'),
  name: text('name').notNull(),
  defaultCurrencyCode: text('default_currency_code').notNull(),
  defaultRegionId: text('default_region_id'),
  defaultLocationId: text('default_location_id'),
  defaultSalesChannelId: text('default_sales_channel_id'),
  metadata: jsonb('metadata').$type<Metadata>(),
  ...timestamps,
})

export const storeCurrency = pgTable(
  'store_currency',
  {
    storeId: text('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'cascade' }),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currency.code),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.currencyCode] })],
)
