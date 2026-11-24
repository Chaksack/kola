import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps, ts, type AddressSnapshot } from './_common'
import { productVariant } from './catalog'

export const stockLocation = pgTable('stock_location', {
  id: id('sloc'),
  name: text('name').notNull(),
  address: jsonb('address').$type<AddressSnapshot>(),
  ...timestamps,
})

export const inventoryItem = pgTable('inventory_item', {
  id: id('iitem'),
  variantId: text('variant_id')
    .notNull()
    .unique()
    .references(() => productVariant.id, { onDelete: 'cascade' }),
  sku: text('sku'),
  requiresShipping: boolean('requires_shipping').notNull().default(true),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  ...timestamps,
})

export const inventoryLevel = pgTable(
  'inventory_level',
  {
    id: id('ilev'),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItem.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => stockLocation.id, { onDelete: 'cascade' }),
    stocked: integer('stocked').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    incoming: integer('incoming').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('inventory_level_item_location_uq').on(t.inventoryItemId, t.locationId)],
)

/**
 * Reservations are created during cart completion with an `expiresAt`. Once the order exists
 * they are linked to the order item and `expiresAt` is cleared. Stale ones are released by cron.
 */
export const reservation = pgTable(
  'reservation',
  {
    id: id('resitem'),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItem.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => stockLocation.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    cartId: text('cart_id'),
    lineItemId: text('line_item_id'),
    orderId: text('order_id'),
    orderItemId: text('order_item_id'),
    description: text('description'),
    expiresAt: ts('expires_at'),
    ...timestamps,
  },
  (t) => [
    index('reservation_item_idx').on(t.inventoryItemId),
    index('reservation_order_item_idx').on(t.orderItemId),
    index('reservation_expires_idx').on(t.expiresAt),
  ],
)
