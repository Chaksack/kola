/** Admin order read models: list with tab counts, KPI stats and the full detail view. */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import * as t from '../db/schema'
import { notFound } from './errors'

export type OrderTab = 'all' | 'unfulfilled' | 'unpaid' | 'returns'

export interface AdminOrderQuery {
  limit: number
  offset: number
  tab: OrderTab
  q?: string
  salesChannelId?: string
  regionId?: string
  paymentStatus?: string
  fulfillmentStatus?: string
  order: 'newest' | 'oldest' | 'total_desc' | 'total_asc'
}

function tabFilter(tab: OrderTab): SQL | undefined {
  switch (tab) {
    case 'unfulfilled':
      return and(ne(t.order.status, 'canceled'), inArray(t.order.fulfillmentStatus, ['not_fulfilled', 'partially_fulfilled']))
    case 'unpaid':
      return and(ne(t.order.status, 'canceled'), inArray(t.order.paymentStatus, ['not_paid', 'awaiting', 'authorized', 'requires_action', 'partially_captured']))
    case 'returns':
      return or(
        inArray(t.order.paymentStatus, ['refunded', 'partially_refunded']),
        sql`exists (select 1 from ${t.orderReturn} r where r.order_id = "order"."id" and r.status <> 'canceled')`,
        sql`exists (select 1 from ${t.exchange} x where x.order_id = "order"."id" and x.status <> 'canceled')`,
      )
    default:
      return undefined
  }
}

export async function listAdminOrders(db: DbLike, q: AdminOrderQuery) {
  const base: (SQL | undefined)[] = [isNull(t.order.deletedAt), eq(t.order.isDraft, false)]
  if (q.q) {
    const term = q.q.trim().replace(/^#/, '')
    const like = `%${term.replace(/[%_]/g, '\\$&')}%`
    base.push(
      or(
        /^\d+$/.test(term) ? eq(t.order.displayId, Number(term)) : undefined,
        ilike(t.order.email, like),
        ilike(sql`coalesce(${t.customer.firstName}, '') || ' ' || coalesce(${t.customer.lastName}, '')`, like),
      ),
    )
  }
  if (q.salesChannelId) base.push(eq(t.order.salesChannelId, q.salesChannelId))
  if (q.regionId) base.push(eq(t.order.regionId, q.regionId))
  if (q.paymentStatus) base.push(eq(t.order.paymentStatus, q.paymentStatus as t.PaymentStatus))
  if (q.fulfillmentStatus) base.push(eq(t.order.fulfillmentStatus, q.fulfillmentStatus as t.FulfillmentStatus))
  const where = and(...base, tabFilter(q.tab))
  const order = { newest: [desc(t.order.createdAt)], oldest: [asc(t.order.createdAt)], total_desc: [desc(t.order.total)], total_asc: [asc(t.order.total)] }[q.order]

  const counted = (tab: OrderTab) =>
    db
      .select({ value: count() })
      .from(t.order)
      .leftJoin(t.customer, eq(t.customer.id, t.order.customerId))
      .where(and(...base, tabFilter(tab)))
      .then((r) => r[0]?.value ?? 0)

  const [rows, all, unfulfilled, unpaid, returns] = await Promise.all([
    db
      .select({
        id: t.order.id,
        displayId: t.order.displayId,
        createdAt: t.order.createdAt,
        email: t.order.email,
        status: t.order.status,
        paymentStatus: t.order.paymentStatus,
        fulfillmentStatus: t.order.fulfillmentStatus,
        total: t.order.total,
        currencyCode: t.order.currencyCode,
        customerId: t.order.customerId,
        firstName: t.customer.firstName,
        lastName: t.customer.lastName,
        salesChannel: t.salesChannel.name,
      })
      .from(t.order)
      .leftJoin(t.customer, eq(t.customer.id, t.order.customerId))
      .leftJoin(t.salesChannel, eq(t.salesChannel.id, t.order.salesChannelId))
      .where(where)
      .orderBy(...order, desc(t.order.displayId))
      .limit(q.limit)
      .offset(q.offset),
    counted('all'),
    counted('unfulfilled'),
    counted('unpaid'),
    counted('returns'),
  ])
  const total = { all, unfulfilled, unpaid, returns }[q.tab]
  return {
    data: rows.map((r) => ({ ...r, customerName: [r.firstName, r.lastName].filter(Boolean).join(' ') || null })),
    count: total,
    tabs: { all, unfulfilled, unpaid, returns },
  }
}

/**
 * KPI strip: last 30 days vs the 30 before, in the store's default currency (orders in other
 * currencies are counted but not summed, since converting needs exchange rates).
 */
export async function orderStats(db: DbLike, currencyCode: string, now = new Date()) {
  const day = 86_400_000
  const start = new Date(now.getTime() - 30 * day)
  const prevStart = new Date(now.getTime() - 60 * day)
  const window = (from: Date, to: Date) =>
    db
      .select({
        orders: sql<number>`count(*)::int`,
        gross: sql<number>`coalesce(sum(${t.order.total}) filter (where ${t.order.currencyCode} = ${currencyCode}), 0)::int`,
        currencyOrders: sql<number>`(count(*) filter (where ${t.order.currencyCode} = ${currencyCode}))::int`,
      })
      .from(t.order)
      .where(and(isNull(t.order.deletedAt), eq(t.order.isDraft, false), ne(t.order.status, 'canceled'), gte(t.order.createdAt, from), lt(t.order.createdAt, to)))
      .then((r) => r[0] ?? { orders: 0, gross: 0, currencyOrders: 0 })
  const [cur, prev, [awaiting], [oldest]] = await Promise.all([
    window(start, now),
    window(prevStart, start),
    db
      .select({ value: count() })
      .from(t.order)
      .where(and(isNull(t.order.deletedAt), eq(t.order.isDraft, false), ne(t.order.status, 'canceled'), inArray(t.order.fulfillmentStatus, ['not_fulfilled', 'partially_fulfilled']))),
    db
      .select({ createdAt: t.order.createdAt })
      .from(t.order)
      .where(and(isNull(t.order.deletedAt), eq(t.order.isDraft, false), ne(t.order.status, 'canceled'), inArray(t.order.fulfillmentStatus, ['not_fulfilled', 'partially_fulfilled'])))
      .orderBy(asc(t.order.createdAt))
      .limit(1),
  ])
  const aov = (w: { gross: number; currencyOrders: number }) => (w.currencyOrders ? Math.round(w.gross / w.currencyOrders) : 0)
  const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10)
  return {
    currencyCode,
    grossSales: { value: cur.gross, change: pct(cur.gross, prev.gross) },
    orders: { value: cur.orders, change: pct(cur.orders, prev.orders) },
    averageOrderValue: { value: aov(cur), change: pct(aov(cur), aov(prev)) },
    awaitingFulfillment: { value: awaiting?.value ?? 0, oldestAt: oldest?.createdAt ?? null },
  }
}

export async function getAdminOrder(db: DbLike, id: string) {
  const [order] = await db.select().from(t.order).where(and(eq(t.order.id, id), isNull(t.order.deletedAt)))
  if (!order) throw notFound('Order')
  const [items, shippingMethods, payments, transactions, fulfillments, returns, exchanges, refunds, events, changes, [region], [channel]] = await Promise.all([
    db.select().from(t.orderItem).where(eq(t.orderItem.orderId, id)).orderBy(asc(t.orderItem.createdAt)),
    db.select().from(t.orderShippingMethod).where(eq(t.orderShippingMethod.orderId, id)),
    db.select().from(t.payment).where(eq(t.payment.orderId, id)).orderBy(asc(t.payment.createdAt)),
    db.select().from(t.orderTransaction).where(eq(t.orderTransaction.orderId, id)).orderBy(asc(t.orderTransaction.createdAt)),
    db.select({ f: t.fulfillment, locationName: t.stockLocation.name }).from(t.fulfillment).leftJoin(t.stockLocation, eq(t.stockLocation.id, t.fulfillment.locationId)).where(eq(t.fulfillment.orderId, id)).orderBy(asc(t.fulfillment.createdAt)),
    db.select().from(t.orderReturn).where(eq(t.orderReturn.orderId, id)).orderBy(asc(t.orderReturn.createdAt)),
    db.select().from(t.exchange).where(eq(t.exchange.orderId, id)).orderBy(asc(t.exchange.createdAt)),
    db.select().from(t.refund).where(eq(t.refund.orderId, id)).orderBy(asc(t.refund.createdAt)),
    db.select().from(t.orderEvent).where(eq(t.orderEvent.orderId, id)).orderBy(desc(t.orderEvent.createdAt)),
    db.select().from(t.orderChange).where(eq(t.orderChange.orderId, id)).orderBy(desc(t.orderChange.createdAt)),
    db.select({ id: t.region.id, name: t.region.name, currencyCode: t.region.currencyCode }).from(t.region).where(eq(t.region.id, order.regionId)),
    db.select({ id: t.salesChannel.id, name: t.salesChannel.name }).from(t.salesChannel).where(eq(t.salesChannel.id, order.salesChannelId)),
  ])
  const fulfillmentIds = fulfillments.map((f) => f.f.id)
  const returnIds = returns.map((r) => r.id)
  const exchangeIds = exchanges.map((x) => x.id)
  const [fItems, tracking, rItems, xItems, reservations, reasons] = await Promise.all([
    fulfillmentIds.length ? db.select().from(t.fulfillmentItem).where(inArray(t.fulfillmentItem.fulfillmentId, fulfillmentIds)) : Promise.resolve([]),
    fulfillmentIds.length ? db.select().from(t.fulfillmentTracking).where(inArray(t.fulfillmentTracking.fulfillmentId, fulfillmentIds)) : Promise.resolve([]),
    returnIds.length ? db.select().from(t.returnItem).where(inArray(t.returnItem.returnId, returnIds)) : Promise.resolve([]),
    exchangeIds.length ? db.select().from(t.exchangeItem).where(inArray(t.exchangeItem.exchangeId, exchangeIds)) : Promise.resolve([]),
    db.select({ orderItemId: t.reservation.orderItemId, quantity: t.reservation.quantity, locationId: t.reservation.locationId }).from(t.reservation).where(eq(t.reservation.orderId, id)),
    db.select().from(t.returnReason).where(isNull(t.returnReason.deletedAt)),
  ])

  let customer = null
  if (order.customerId) {
    const [c] = await db.select().from(t.customer).where(eq(t.customer.id, order.customerId))
    if (c) {
      const [[orderCount], groups] = await Promise.all([
        db.select({ value: count() }).from(t.order).where(and(eq(t.order.customerId, c.id), isNull(t.order.deletedAt), eq(t.order.isDraft, false))),
        db.select({ id: t.customerGroup.id, name: t.customerGroup.name }).from(t.customerGroupMember).innerJoin(t.customerGroup, eq(t.customerGroup.id, t.customerGroupMember.groupId)).where(eq(t.customerGroupMember.customerId, c.id)),
      ])
      customer = { id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName, phone: c.phone, hasAccount: c.hasAccount, orderCount: orderCount?.value ?? 0, groups }
    }
  }

  const captured = payments.reduce((a, p) => a + p.capturedAmount, 0)
  const refunded = payments.reduce((a, p) => a + p.refundedAmount, 0)
  const authorized = payments.filter((p) => !p.canceledAt).reduce((a, p) => a + p.amount, 0)
  return {
    ...order,
    region: region ?? null,
    salesChannel: channel ?? null,
    customer,
    items: items.map((i) => ({
      ...i,
      reservedQuantity: reservations.filter((r) => r.orderItemId === i.id).reduce((a, r) => a + r.quantity, 0),
      fulfillableQuantity: Math.max(0, i.quantity - i.fulfilledQuantity),
      returnableQuantity: Math.max(0, i.fulfilledQuantity - i.returnedQuantity - rItems.filter((r) => r.orderItemId === i.id && returns.find((x) => x.id === r.returnId)?.status === 'requested').reduce((a, r) => a + r.quantity, 0)),
    })),
    shippingMethods,
    payments: payments.map((p) => ({ id: p.id, providerId: p.providerId, amount: p.amount, currencyCode: p.currencyCode, capturedAmount: p.capturedAmount, refundedAmount: p.refundedAmount, providerReference: p.providerReference, capturedAt: p.capturedAt, canceledAt: p.canceledAt, createdAt: p.createdAt })),
    paymentSummary: { authorized, captured, refunded, capturable: Math.max(0, authorized - captured), refundable: Math.max(0, captured - refunded) },
    transactions,
    fulfillments: fulfillments.map(({ f, locationName }) => ({ ...f, locationName, items: fItems.filter((i) => i.fulfillmentId === f.id), tracking: tracking.filter((x) => x.fulfillmentId === f.id) })),
    returns: returns.map((r) => ({ ...r, items: rItems.filter((i) => i.returnId === r.id).map((i) => ({ ...i, reason: reasons.find((x) => x.id === i.reasonId)?.label ?? null })) })),
    exchanges: exchanges.map((x) => ({ ...x, items: xItems.filter((i) => i.exchangeId === x.id) })),
    refunds,
    events,
    changes,
  }
}
export type AdminOrder = Awaited<ReturnType<typeof getAdminOrder>>
