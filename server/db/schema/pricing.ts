import { index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { id, timestamps, ts } from './_common'
import { productVariant } from './catalog'
import { region } from './region'

export const priceSet = pgTable('price_set', {
  id: id('pset'),
  variantId: text('variant_id')
    .notNull()
    .unique()
    .references(() => productVariant.id, { onDelete: 'cascade' }),
  ...timestamps,
})

export const priceList = pgTable('price_list', {
  id: id('plist'),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type', { enum: ['sale', 'override'] }).notNull().default('sale'),
  status: text('status', { enum: ['draft', 'active'] }).notNull().default('draft'),
  startsAt: ts('starts_at'),
  endsAt: ts('ends_at'),
  ...timestamps,
})

/** Amount is integer minor units in `currencyCode`. */
export const price = pgTable(
  'price',
  {
    id: id('price'),
    priceSetId: text('price_set_id')
      .notNull()
      .references(() => priceSet.id, { onDelete: 'cascade' }),
    priceListId: text('price_list_id').references(() => priceList.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    currencyCode: text('currency_code').notNull(),
    regionId: text('region_id').references(() => region.id, { onDelete: 'cascade' }),
    minQuantity: integer('min_quantity'),
    maxQuantity: integer('max_quantity'),
    ...timestamps,
  },
  (t) => [
    index('price_price_set_idx').on(t.priceSetId),
    index('price_price_list_idx').on(t.priceListId),
    index('price_currency_idx').on(t.currencyCode),
  ],
)

export const priceListCustomerGroup = pgTable(
  'price_list_customer_group',
  {
    priceListId: text('price_list_id')
      .notNull()
      .references(() => priceList.id, { onDelete: 'cascade' }),
    customerGroupId: text('customer_group_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.priceListId, t.customerGroupId] })],
)
