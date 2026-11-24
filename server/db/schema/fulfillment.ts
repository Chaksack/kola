import { boolean, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { id, timestamps, ts, type Metadata } from './_common'
import { stockLocation } from './inventory'
import { region } from './region'

export const shippingProfile = pgTable('shipping_profile', {
  id: id('sp'),
  name: text('name').notNull(),
  type: text('type', { enum: ['default', 'gift_card', 'custom'] }).notNull().default('default'),
  ...timestamps,
})

export const serviceZone = pgTable('service_zone', {
  id: id('serzo'),
  name: text('name').notNull(),
  locationId: text('location_id')
    .notNull()
    .references(() => stockLocation.id, { onDelete: 'cascade' }),
  ...timestamps,
})

export const serviceZoneCountry = pgTable(
  'service_zone_country',
  {
    serviceZoneId: text('service_zone_id')
      .notNull()
      .references(() => serviceZone.id, { onDelete: 'cascade' }),
    countryCode: text('country_code').notNull(),
  },
  (t) => [primaryKey({ columns: [t.serviceZoneId, t.countryCode] })],
)

export interface ShippingRule {
  attribute: 'subtotal' | 'is_return' | 'enabled_in_store'
  operator: 'gte' | 'lte' | 'eq'
  value: number | string | boolean
}

export const shippingOption = pgTable(
  'shipping_option',
  {
    id: id('so'),
    name: text('name').notNull(),
    serviceZoneId: text('service_zone_id')
      .notNull()
      .references(() => serviceZone.id, { onDelete: 'cascade' }),
    shippingProfileId: text('shipping_profile_id')
      .notNull()
      .references(() => shippingProfile.id),
    priceType: text('price_type', { enum: ['flat', 'calculated'] }).notNull().default('flat'),
    providerId: text('provider_id').notNull().default('manual'),
    isReturn: boolean('is_return').notNull().default(false),
    adminOnly: boolean('admin_only').notNull().default(false),
    description: text('description'),
    rules: jsonb('rules').$type<ShippingRule[]>().notNull().default([]),
    data: jsonb('data').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [index('shipping_option_zone_idx').on(t.serviceZoneId)],
)

export const shippingOptionPrice = pgTable(
  'shipping_option_price',
  {
    id: id('sop'),
    shippingOptionId: text('shipping_option_id')
      .notNull()
      .references(() => shippingOption.id, { onDelete: 'cascade' }),
    currencyCode: text('currency_code').notNull(),
    regionId: text('region_id').references(() => region.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    ...timestamps,
  },
  (t) => [index('shipping_option_price_option_idx').on(t.shippingOptionId)],
)

export const fulfillment = pgTable(
  'fulfillment',
  {
    id: id('ful'),
    orderId: text('order_id').notNull(),
    locationId: text('location_id')
      .notNull()
      .references(() => stockLocation.id),
    providerId: text('provider_id').notNull().default('manual'),
    shippingOptionId: text('shipping_option_id'),
    packedAt: ts('packed_at'),
    shippedAt: ts('shipped_at'),
    deliveredAt: ts('delivered_at'),
    canceledAt: ts('canceled_at'),
    data: jsonb('data').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [index('fulfillment_order_idx').on(t.orderId)],
)

export const fulfillmentItem = pgTable(
  'fulfillment_item',
  {
    id: id('fulit'),
    fulfillmentId: text('fulfillment_id')
      .notNull()
      .references(() => fulfillment.id, { onDelete: 'cascade' }),
    orderItemId: text('order_item_id').notNull(),
    inventoryItemId: text('inventory_item_id'),
    title: text('title').notNull(),
    sku: text('sku'),
    quantity: integer('quantity').notNull(),
    ...timestamps,
  },
  (t) => [index('fulfillment_item_fulfillment_idx').on(t.fulfillmentId)],
)

export const fulfillmentTracking = pgTable('fulfillment_tracking', {
  id: id('trk'),
  fulfillmentId: text('fulfillment_id')
    .notNull()
    .references(() => fulfillment.id, { onDelete: 'cascade' }),
  trackingNumber: text('tracking_number').notNull(),
  trackingUrl: text('tracking_url'),
  carrier: text('carrier'),
  ...timestamps,
})
