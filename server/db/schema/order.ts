import { boolean, index, integer, jsonb, pgSequence, pgTable, text } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { id, timestamps, ts, type AddressSnapshot, type Metadata } from './_common'

export const ORDER_STATUSES = ['pending', 'completed', 'canceled', 'archived', 'requires_action'] as const
export const PAYMENT_STATUSES = [
  'not_paid',
  'awaiting',
  'authorized',
  'partially_captured',
  'captured',
  'partially_refunded',
  'refunded',
  'canceled',
  'requires_action',
] as const
export const FULFILLMENT_STATUSES = [
  'not_fulfilled',
  'partially_fulfilled',
  'fulfilled',
  'partially_shipped',
  'shipped',
  'partially_delivered',
  'delivered',
  'canceled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

export const orderDisplayIdSeq = pgSequence('order_display_id_seq', { startWith: 10400 })

export const order = pgTable(
  'order',
  {
    id: id('order'),
    displayId: integer('display_id')
      .notNull()
      .unique()
      .default(sql`nextval('order_display_id_seq')`),
    status: text('status', { enum: ORDER_STATUSES }).notNull().default('pending'),
    paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }).notNull().default('not_paid'),
    fulfillmentStatus: text('fulfillment_status', { enum: FULFILLMENT_STATUSES }).notNull().default('not_fulfilled'),
    regionId: text('region_id').notNull(),
    salesChannelId: text('sales_channel_id').notNull(),
    customerId: text('customer_id'),
    email: text('email').notNull(),
    currencyCode: text('currency_code').notNull(),
    cartId: text('cart_id').unique(),
    shippingAddress: jsonb('shipping_address').$type<AddressSnapshot>(),
    billingAddress: jsonb('billing_address').$type<AddressSnapshot>(),
    version: integer('version').notNull().default(1),
    isTaxInclusive: boolean('is_tax_inclusive').notNull().default(false),
    isDraft: boolean('is_draft').notNull().default(false),
    // Totals snapshot (minor units)
    itemSubtotal: integer('item_subtotal').notNull().default(0),
    subtotal: integer('subtotal').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    shippingTotal: integer('shipping_total').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    total: integer('total').notNull().default(0),
    paidTotal: integer('paid_total').notNull().default(0),
    refundedTotal: integer('refunded_total').notNull().default(0),
    promoCodes: jsonb('promo_codes').$type<string[]>().notNull().default([]),
    canceledAt: ts('canceled_at'),
    metadata: jsonb('metadata').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [
    index('order_customer_idx').on(t.customerId),
    index('order_created_idx').on(t.createdAt),
    index('order_status_idx').on(t.status, t.paymentStatus, t.fulfillmentStatus),
  ],
)

export const orderItem = pgTable(
  'order_item',
  {
    id: id('ordli'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    variantId: text('variant_id'),
    productId: text('product_id'),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    variantTitle: text('variant_title'),
    sku: text('sku'),
    thumbnail: text('thumbnail'),
    quantity: integer('quantity').notNull(),
    fulfilledQuantity: integer('fulfilled_quantity').notNull().default(0),
    shippedQuantity: integer('shipped_quantity').notNull().default(0),
    deliveredQuantity: integer('delivered_quantity').notNull().default(0),
    returnedQuantity: integer('returned_quantity').notNull().default(0),
    // Price snapshot (minor units)
    unitPrice: integer('unit_price').notNull(),
    subtotal: integer('subtotal').notNull(),
    discountTotal: integer('discount_total').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    total: integer('total').notNull(),
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    isTaxInclusive: boolean('is_tax_inclusive').notNull().default(false),
    requiresShipping: boolean('requires_shipping').notNull().default(true),
    isGiftcard: boolean('is_giftcard').notNull().default(false),
    metadata: jsonb('metadata').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [index('order_item_order_idx').on(t.orderId)],
)

export const orderShippingMethod = pgTable('order_shipping_method', {
  id: id('ordsm'),
  orderId: text('order_id')
    .notNull()
    .references(() => order.id, { onDelete: 'cascade' }),
  shippingOptionId: text('shipping_option_id'),
  name: text('name').notNull(),
  amount: integer('amount').notNull(),
  discountTotal: integer('discount_total').notNull().default(0),
  taxTotal: integer('tax_total').notNull().default(0),
  ...timestamps,
})

export const orderTransaction = pgTable(
  'order_transaction',
  {
    id: id('ordtrx'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    paymentId: text('payment_id'),
    kind: text('kind', { enum: ['authorization', 'capture', 'refund', 'void', 'difference'] }).notNull(),
    amount: integer('amount').notNull(),
    currencyCode: text('currency_code').notNull(),
    providerId: text('provider_id'),
    reference: text('reference'),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('order_transaction_order_idx').on(t.orderId)],
)

export interface OrderChangeAction {
  action: 'item_add' | 'item_remove' | 'item_update' | 'shipping_update'
  itemId?: string
  variantId?: string
  quantity?: number
  unitPrice?: number
  title?: string
}

export const orderChange = pgTable(
  'order_change',
  {
    id: id('ordch'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    type: text('type', { enum: ['edit', 'return', 'exchange', 'claim'] }).notNull(),
    status: text('status', { enum: ['proposed', 'confirmed', 'declined', 'canceled'] }).notNull().default('proposed'),
    actions: jsonb('actions').$type<OrderChangeAction[]>().notNull().default([]),
    differenceDue: integer('difference_due').notNull().default(0),
    note: text('note'),
    createdBy: text('created_by'),
    confirmedAt: ts('confirmed_at'),
    confirmedBy: text('confirmed_by'),
    ...timestamps,
  },
  (t) => [index('order_change_order_idx').on(t.orderId)],
)

export const orderVersion = pgTable(
  'order_version',
  {
    id: id('ordver'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<Metadata>().notNull(),
    ...timestamps,
  },
  (t) => [index('order_version_order_idx').on(t.orderId)],
)

export const orderEvent = pgTable(
  'order_event',
  {
    id: id('ordev'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    message: text('message').notNull(),
    tone: text('tone', { enum: ['ok', 'warn', 'info', 'neutral'] }).notNull().default('neutral'),
    actorType: text('actor_type', { enum: ['user', 'customer', 'system'] }).notNull().default('system'),
    actorId: text('actor_id'),
    actorName: text('actor_name'),
    data: jsonb('data').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [index('order_event_order_idx').on(t.orderId)],
)

export const returnReason = pgTable('return_reason', {
  id: id('rr'),
  value: text('value').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
  ...timestamps,
})

export const orderReturn = pgTable(
  'return',
  {
    id: id('ret'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    exchangeId: text('exchange_id'),
    claimId: text('claim_id'),
    status: text('status', { enum: ['requested', 'received', 'canceled'] }).notNull().default('requested'),
    locationId: text('location_id'),
    refundAmount: integer('refund_amount').notNull().default(0),
    note: text('note'),
    receivedAt: ts('received_at'),
    ...timestamps,
  },
  (t) => [index('return_order_idx').on(t.orderId)],
)

export const returnItem = pgTable('return_item', {
  id: id('retitem'),
  returnId: text('return_id')
    .notNull()
    .references(() => orderReturn.id, { onDelete: 'cascade' }),
  orderItemId: text('order_item_id').notNull(),
  quantity: integer('quantity').notNull(),
  receivedQuantity: integer('received_quantity').notNull().default(0),
  reasonId: text('reason_id'),
  note: text('note'),
  ...timestamps,
})

export const exchange = pgTable(
  'exchange',
  {
    id: id('exc'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    returnId: text('return_id'),
    status: text('status', { enum: ['requested', 'completed', 'canceled'] }).notNull().default('requested'),
    differenceDue: integer('difference_due').notNull().default(0),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('exchange_order_idx').on(t.orderId)],
)

export const exchangeItem = pgTable('exchange_item', {
  id: id('excitem'),
  exchangeId: text('exchange_id')
    .notNull()
    .references(() => exchange.id, { onDelete: 'cascade' }),
  variantId: text('variant_id').notNull(),
  title: text('title').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  ...timestamps,
})

export const claim = pgTable(
  'claim',
  {
    id: id('claim'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['refund', 'replace'] }).notNull(),
    status: text('status', { enum: ['requested', 'completed', 'canceled'] }).notNull().default('requested'),
    refundAmount: integer('refund_amount').notNull().default(0),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('claim_order_idx').on(t.orderId)],
)

export const claimItem = pgTable('claim_item', {
  id: id('claimitem'),
  claimId: text('claim_id')
    .notNull()
    .references(() => claim.id, { onDelete: 'cascade' }),
  orderItemId: text('order_item_id').notNull(),
  quantity: integer('quantity').notNull(),
  reason: text('reason', { enum: ['missing_item', 'wrong_item', 'production_failure', 'other'] }).notNull(),
  note: text('note'),
  ...timestamps,
})

export const refund = pgTable(
  'refund',
  {
    id: id('ref'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    paymentId: text('payment_id'),
    returnId: text('return_id'),
    amount: integer('amount').notNull(),
    currencyCode: text('currency_code').notNull(),
    reason: text('reason'),
    note: text('note'),
    providerReference: text('provider_reference'),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (t) => [index('refund_order_idx').on(t.orderId)],
)

export const giftCard = pgTable('gift_card', {
  id: id('gift'),
  code: text('code').notNull().unique(),
  value: integer('value').notNull(),
  balance: integer('balance').notNull(),
  currencyCode: text('currency_code').notNull(),
  regionId: text('region_id'),
  orderId: text('order_id'),
  isDisabled: boolean('is_disabled').notNull().default(false),
  endsAt: ts('ends_at'),
  ...timestamps,
})
