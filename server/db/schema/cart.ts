import { boolean, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { id, timestamps, ts, type AddressSnapshot, type Metadata } from './_common'

export const cart = pgTable(
  'cart',
  {
    id: id('cart'),
    regionId: text('region_id').notNull(),
    salesChannelId: text('sales_channel_id').notNull(),
    customerId: text('customer_id'),
    email: text('email'),
    currencyCode: text('currency_code').notNull(),
    shippingAddress: jsonb('shipping_address').$type<AddressSnapshot>(),
    billingAddress: jsonb('billing_address').$type<AddressSnapshot>(),
    completedAt: ts('completed_at'),
    expiresAt: ts('expires_at'),
    metadata: jsonb('metadata').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [index('cart_customer_idx').on(t.customerId), index('cart_expires_idx').on(t.expiresAt)],
)

export const cartLineItem = pgTable(
  'cart_line_item',
  {
    id: id('cali'),
    cartId: text('cart_id')
      .notNull()
      .references(() => cart.id, { onDelete: 'cascade' }),
    variantId: text('variant_id').notNull(),
    productId: text('product_id').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    variantTitle: text('variant_title'),
    thumbnail: text('thumbnail'),
    sku: text('sku'),
    productHandle: text('product_handle'),
    collectionId: text('collection_id'),
    productTypeId: text('product_type_id'),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    compareAtUnitPrice: integer('compare_at_unit_price'),
    isTaxInclusive: boolean('is_tax_inclusive').notNull().default(false),
    isDiscountable: boolean('is_discountable').notNull().default(true),
    isGiftcard: boolean('is_giftcard').notNull().default(false),
    requiresShipping: boolean('requires_shipping').notNull().default(true),
    metadata: jsonb('metadata').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [index('cart_line_item_cart_idx').on(t.cartId)],
)

export const cartShippingMethod = pgTable('cart_shipping_method', {
  id: id('casm'),
  cartId: text('cart_id')
    .notNull()
    .references(() => cart.id, { onDelete: 'cascade' }),
  shippingOptionId: text('shipping_option_id').notNull(),
  name: text('name').notNull(),
  amount: integer('amount').notNull(),
  isTaxInclusive: boolean('is_tax_inclusive').notNull().default(false),
  data: jsonb('data').$type<Metadata>(),
  ...timestamps,
})

export const cartPromotion = pgTable(
  'cart_promotion',
  {
    cartId: text('cart_id')
      .notNull()
      .references(() => cart.id, { onDelete: 'cascade' }),
    promotionId: text('promotion_id').notNull(),
    code: text('code'),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.promotionId] })],
)
