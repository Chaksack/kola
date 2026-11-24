/** Order read models shared by the storefront and admin. */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import * as t from '../db/schema'
import { notFound } from './errors'

export async function getStoreOrder(db: DbLike, id: string) {
  const [order] = await db.select().from(t.order).where(and(eq(t.order.id, id), isNull(t.order.deletedAt), eq(t.order.isDraft, false)))
  if (!order) throw notFound('Order')
  const [items, shippingMethods, fulfillments] = await Promise.all([
    db.select().from(t.orderItem).where(eq(t.orderItem.orderId, id)).orderBy(asc(t.orderItem.createdAt)),
    db.select().from(t.orderShippingMethod).where(eq(t.orderShippingMethod.orderId, id)),
    db.select().from(t.fulfillment).where(and(eq(t.fulfillment.orderId, id), isNull(t.fulfillment.canceledAt))).orderBy(asc(t.fulfillment.createdAt)),
  ])
  const tracking = fulfillments.length ? await db.select().from(t.fulfillmentTracking).where(inArray(t.fulfillmentTracking.fulfillmentId, fulfillments.map((f) => f.id))) : []
  const [payment] = await db.select({ providerId: t.payment.providerId }).from(t.payment).where(eq(t.payment.orderId, id)).limit(1)
  return {
    id: order.id,
    displayId: order.displayId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    email: order.email,
    currencyCode: order.currencyCode,
    createdAt: order.createdAt,
    shippingAddress: order.shippingAddress,
    isTaxInclusive: order.isTaxInclusive,
    promoCodes: order.promoCodes,
    paymentProvider: payment?.providerId ?? null,
    items: items.map((i) => ({ id: i.id, title: i.title, variantTitle: i.variantTitle, sku: i.sku, thumbnail: i.thumbnail, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, discountTotal: i.discountTotal, fulfilledQuantity: i.fulfilledQuantity, returnedQuantity: i.returnedQuantity })),
    shippingMethods: shippingMethods.map((m) => ({ name: m.name, amount: m.amount })),
    fulfillments: fulfillments.map((f) => ({ id: f.id, shippedAt: f.shippedAt, deliveredAt: f.deliveredAt, tracking: tracking.filter((x) => x.fulfillmentId === f.id).map((x) => ({ number: x.trackingNumber, url: x.trackingUrl, carrier: x.carrier })) })),
    totals: { itemSubtotal: order.itemSubtotal, discountTotal: order.discountTotal, shippingTotal: order.shippingTotal, taxTotal: order.taxTotal, total: order.total, refundedTotal: order.refundedTotal },
  }
}
export type StoreOrder = Awaited<ReturnType<typeof getStoreOrder>>

export async function listCustomerOrders(db: DbLike, customerId: string, limit: number, offset: number) {
  const where = and(eq(t.order.customerId, customerId), isNull(t.order.deletedAt), eq(t.order.isDraft, false))
  const rows = await db
    .select({ id: t.order.id, displayId: t.order.displayId, status: t.order.status, paymentStatus: t.order.paymentStatus, fulfillmentStatus: t.order.fulfillmentStatus, total: t.order.total, currencyCode: t.order.currencyCode, createdAt: t.order.createdAt })
    .from(t.order)
    .where(where)
    .orderBy(desc(t.order.createdAt))
    .limit(limit)
    .offset(offset)
  const ids = rows.map((r) => r.id)
  const counts = ids.length ? await db.select({ orderId: t.orderItem.orderId, quantity: t.orderItem.quantity, title: t.orderItem.title }).from(t.orderItem).where(inArray(t.orderItem.orderId, ids)) : []
  return rows.map((r) => {
    const own = counts.filter((c) => c.orderId === r.id)
    return { ...r, itemCount: own.reduce((a, c) => a + c.quantity, 0), summary: own.map((c) => c.title).slice(0, 2).join(', ') }
  })
}
