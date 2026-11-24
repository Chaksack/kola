import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps, ts, type Metadata } from './_common'

export const PAYMENT_COLLECTION_STATUSES = [
  'not_paid',
  'awaiting',
  'authorized',
  'partially_authorized',
  'canceled',
  'completed',
] as const

export const paymentCollection = pgTable(
  'payment_collection',
  {
    id: id('paycol'),
    cartId: text('cart_id'),
    orderId: text('order_id'),
    currencyCode: text('currency_code').notNull(),
    amount: integer('amount').notNull(),
    authorizedAmount: integer('authorized_amount').notNull().default(0),
    capturedAmount: integer('captured_amount').notNull().default(0),
    refundedAmount: integer('refunded_amount').notNull().default(0),
    status: text('status', { enum: PAYMENT_COLLECTION_STATUSES }).notNull().default('not_paid'),
    ...timestamps,
  },
  (t) => [index('payment_collection_cart_idx').on(t.cartId), index('payment_collection_order_idx').on(t.orderId)],
)

export const PAYMENT_SESSION_STATUSES = [
  'pending',
  'requires_action',
  'authorized',
  'captured',
  'error',
  'canceled',
] as const

export const paymentSession = pgTable(
  'payment_session',
  {
    id: id('payses'),
    paymentCollectionId: text('payment_collection_id')
      .notNull()
      .references(() => paymentCollection.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    amount: integer('amount').notNull(),
    currencyCode: text('currency_code').notNull(),
    status: text('status', { enum: PAYMENT_SESSION_STATUSES }).notNull().default('pending'),
    /** Provider references only (intent id, access code). Never card data. */
    data: jsonb('data').$type<Metadata>().notNull().default({}),
    authorizedAt: ts('authorized_at'),
    ...timestamps,
  },
  (t) => [index('payment_session_collection_idx').on(t.paymentCollectionId)],
)

export const payment = pgTable(
  'payment',
  {
    id: id('pay'),
    paymentCollectionId: text('payment_collection_id')
      .notNull()
      .references(() => paymentCollection.id, { onDelete: 'cascade' }),
    paymentSessionId: text('payment_session_id'),
    orderId: text('order_id'),
    providerId: text('provider_id').notNull(),
    amount: integer('amount').notNull(),
    currencyCode: text('currency_code').notNull(),
    capturedAmount: integer('captured_amount').notNull().default(0),
    refundedAmount: integer('refunded_amount').notNull().default(0),
    providerReference: text('provider_reference'),
    data: jsonb('data').$type<Metadata>().notNull().default({}),
    capturedAt: ts('captured_at'),
    canceledAt: ts('canceled_at'),
    ...timestamps,
  },
  (t) => [index('payment_order_idx').on(t.orderId), index('payment_reference_idx').on(t.providerReference)],
)
