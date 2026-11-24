/**
 * Admin order actions. Each runs in one transaction (provider calls happen before the DB writes they
 * justify) and ends by re-deriving the order's payment and fulfillment status.
 *
 * Stock movements:
 *  - create fulfillment: reserved stock leaves the shelf (reserved −n, stocked −n at that location)
 *  - cancel fulfillment: stock goes back and is reserved again
 *  - cancel order: reservations are released
 *  - receive return: returned units are restocked at the chosen location
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DbLike, Tx } from '../db/client'
import * as t from '../db/schema'
import type { PaymentProvider } from '../providers/payment/types'
import { divRound } from '../../shared/utils/money'
import { apiError, badRequest, conflict, notFound } from './errors'
import { consumeReservedAt, releaseAt, restockAt, tryReserveAt } from './inventory'
import { deriveFulfillmentStatus, derivePaymentStatus } from './order-status'
import { calculatePrices } from './pricing'
import { computeTotals } from './totals'

export interface Actor {
  id: string
  name: string | null
}

export interface OrderActionDeps {
  db: DbLike
  withTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
  provider: (id: string) => PaymentProvider
  emit: (name: 'order.fulfilled' | 'order.shipped' | 'order.delivered' | 'order.canceled' | 'order.updated' | 'payment.captured' | 'payment.refunded' | 'return.requested' | 'return.received' | 'exchange.created', data: Record<string, unknown>) => Promise<unknown>
  actor: Actor
}

type OrderRow = typeof t.order.$inferSelect

async function loadOrder(db: DbLike, id: string): Promise<OrderRow> {
  const [o] = await db.select().from(t.order).where(and(eq(t.order.id, id), isNull(t.order.deletedAt)))
  if (!o) throw notFound('Order')
  return o
}

function assertActive(o: OrderRow) {
  if (o.status === 'canceled') throw conflict('This order is canceled')
}

async function event(db: DbLike, orderId: string, actor: Actor, type: string, message: string, tone: 'ok' | 'warn' | 'info' | 'neutral' = 'neutral', data?: Record<string, unknown>) {
  await db.insert(t.orderEvent).values({ orderId, type, message, tone, actorType: 'user', actorId: actor.id, actorName: actor.name, data })
}

/** Re-derive statuses and money totals from items and payments. */
export async function recomputeOrder(db: DbLike, orderId: string) {
  const o = await loadOrder(db, orderId)
  const [items, payments] = await Promise.all([db.select().from(t.orderItem).where(eq(t.orderItem.orderId, orderId)), db.select().from(t.payment).where(eq(t.payment.orderId, orderId))])
  const captured = payments.reduce((a, p) => a + p.capturedAmount, 0)
  const refunded = payments.reduce((a, p) => a + p.refundedAmount, 0)
  const authorized = payments.filter((p) => !p.canceledAt && p.providerId !== 'manual').reduce((a, p) => a + p.amount, 0)
  const awaitingManual = payments.some((p) => p.providerId === 'manual' && !p.canceledAt)
  const canceled = o.status === 'canceled'
  const paymentStatus = derivePaymentStatus({ total: o.total, authorized, captured, refunded, awaitingManual, canceled })
  const fulfillmentStatus = deriveFulfillmentStatus(items, canceled)
  const done = !canceled && fulfillmentStatus === 'delivered' && ['captured', 'partially_refunded', 'refunded'].includes(paymentStatus)
  await db
    .update(t.order)
    .set({ paymentStatus, fulfillmentStatus, paidTotal: captured, refundedTotal: refunded, status: canceled ? 'canceled' : done ? 'completed' : o.status === 'completed' ? 'pending' : o.status })
    .where(eq(t.order.id, orderId))
  return { paymentStatus, fulfillmentStatus }
}

// ── Notes ───────────────────────────────────────────────────────────────

export async function addNote(deps: OrderActionDeps, orderId: string, message: string) {
  await loadOrder(deps.db, orderId)
  await event(deps.db, orderId, deps.actor, 'note', message)
}

// ── Payments ────────────────────────────────────────────────────────────

export async function capturePayment(deps: OrderActionDeps, orderId: string, amount?: number) {
  const o = await loadOrder(deps.db, orderId)
  assertActive(o)
  const payments = await deps.db.select().from(t.payment).where(and(eq(t.payment.orderId, orderId), isNull(t.payment.canceledAt))).orderBy(asc(t.payment.createdAt))
  const pay = payments.find((p) => p.capturedAmount < p.amount)
  if (!pay) throw conflict('Nothing left to capture')
  const capturable = pay.amount - pay.capturedAmount
  const value = amount ?? capturable
  if (value <= 0 || value > capturable) throw badRequest(`You can capture up to ${capturable}`, [{ path: 'amount', message: 'Too much' }])
  const result = await deps.provider(pay.providerId).capture(pay.data, pay.capturedAmount + value)
  await deps.withTx(async (tx) => {
    await tx.update(t.payment).set({ capturedAmount: sql`${t.payment.capturedAmount} + ${value}`, capturedAt: new Date(), data: { ...pay.data, ...result.data } }).where(eq(t.payment.id, pay.id))
    await tx.update(t.paymentCollection).set({ capturedAmount: sql`${t.paymentCollection.capturedAmount} + ${value}` }).where(eq(t.paymentCollection.id, pay.paymentCollectionId))
    await tx.insert(t.orderTransaction).values({ orderId, paymentId: pay.id, kind: 'capture', amount: value, currencyCode: pay.currencyCode, providerId: pay.providerId, reference: pay.providerReference })
    await event(tx, orderId, deps.actor, 'payment.captured', pay.providerId === 'manual' ? 'Cash payment recorded' : 'Payment captured', 'ok', { amount: value })
    await recomputeOrder(tx, orderId)
  })
  await deps.emit('payment.captured', { id: orderId, amount: value })
}

/** Record money received outside a provider (bank transfer, extra cash for an exchange). */
export async function recordPayment(deps: OrderActionDeps, orderId: string, amount: number, note?: string) {
  const o = await loadOrder(deps.db, orderId)
  assertActive(o)
  await deps.withTx(async (tx) => {
    const [col] = await tx.insert(t.paymentCollection).values({ orderId, currencyCode: o.currencyCode, amount, capturedAmount: amount, status: 'completed' }).returning()
    const [pay] = await tx.insert(t.payment).values({ paymentCollectionId: col!.id, orderId, providerId: 'manual', amount, currencyCode: o.currencyCode, capturedAmount: amount, capturedAt: new Date(), data: { note } }).returning()
    await tx.insert(t.orderTransaction).values({ orderId, paymentId: pay!.id, kind: 'capture', amount, currencyCode: o.currencyCode, providerId: 'manual', note })
    await event(tx, orderId, deps.actor, 'payment.recorded', note ? `Payment recorded: ${note}` : 'Payment recorded', 'ok', { amount })
    await recomputeOrder(tx, orderId)
  })
}

export async function refundPayment(deps: OrderActionDeps, orderId: string, amount: number, opts: { reason?: string; note?: string; returnId?: string } = {}) {
  const o = await loadOrder(deps.db, orderId)
  const payments = await deps.db.select().from(t.payment).where(eq(t.payment.orderId, orderId)).orderBy(asc(t.payment.createdAt))
  const refundable = payments.reduce((a, p) => a + p.capturedAmount - p.refundedAmount, 0)
  if (amount <= 0 || amount > refundable) throw badRequest(refundable ? `You can refund up to ${refundable}` : 'Nothing has been captured yet', [{ path: 'amount', message: 'Too much' }])
  // Refund from the most recent payments first.
  let left = amount
  const plan: { pay: (typeof payments)[number]; value: number; reference: string | null }[] = []
  for (const pay of [...payments].reverse()) {
    if (left <= 0) break
    const value = Math.min(left, pay.capturedAmount - pay.refundedAmount)
    if (value <= 0) continue
    const { reference } = await deps.provider(pay.providerId).refund(pay.data, value)
    plan.push({ pay, value, reference })
    left -= value
  }
  await deps.withTx(async (tx) => {
    for (const { pay, value, reference } of plan) {
      await tx.update(t.payment).set({ refundedAmount: sql`${t.payment.refundedAmount} + ${value}` }).where(eq(t.payment.id, pay.id))
      await tx.update(t.paymentCollection).set({ refundedAmount: sql`${t.paymentCollection.refundedAmount} + ${value}` }).where(eq(t.paymentCollection.id, pay.paymentCollectionId))
      await tx.insert(t.refund).values({ orderId, paymentId: pay.id, returnId: opts.returnId, amount: value, currencyCode: o.currencyCode, reason: opts.reason, note: opts.note, providerReference: reference, createdBy: deps.actor.id })
      await tx.insert(t.orderTransaction).values({ orderId, paymentId: pay.id, kind: 'refund', amount: -value, currencyCode: o.currencyCode, providerId: pay.providerId, reference, note: opts.note })
    }
    await event(tx, orderId, deps.actor, 'payment.refunded', `Refunded${opts.reason ? ` (${opts.reason})` : ''}`, 'neutral', { amount })
    await recomputeOrder(tx, orderId)
  })
  await deps.emit('payment.refunded', { id: orderId, amount })
}

// ── Fulfillment ─────────────────────────────────────────────────────────

async function inventoryItemFor(db: DbLike, variantId: string | null) {
  if (!variantId) return null
  const [row] = await db
    .select({ id: t.inventoryItem.id, manage: t.productVariant.manageInventory })
    .from(t.inventoryItem)
    .innerJoin(t.productVariant, eq(t.productVariant.id, t.inventoryItem.variantId))
    .where(eq(t.inventoryItem.variantId, variantId))
  return row?.manage ? row.id : null
}

/** Take `qty` of an order item off the shelf at `locationId`, using its reservations. */
async function pickStock(tx: Tx, orderItemId: string, inventoryItemId: string, locationId: string, qty: number) {
  const reservations = await tx.select().from(t.reservation).where(eq(t.reservation.orderItemId, orderItemId))
  let left = qty
  // Reservations at this location first, then others (moved here).
  for (const r of [...reservations].sort((a, b) => Number(b.locationId === locationId) - Number(a.locationId === locationId))) {
    if (left <= 0) break
    const take = Math.min(left, r.quantity)
    if (r.locationId === locationId) {
      await consumeReservedAt(tx, inventoryItemId, locationId, take)
    } else {
      await releaseAt(tx, inventoryItemId, r.locationId, take)
      if (!(await tryReserveAt(tx, inventoryItemId, locationId, take))) throw apiError(409, 'insufficient_inventory', 'Not enough stock at this location')
      await consumeReservedAt(tx, inventoryItemId, locationId, take)
    }
    if (take === r.quantity) await tx.delete(t.reservation).where(eq(t.reservation.id, r.id))
    else await tx.update(t.reservation).set({ quantity: r.quantity - take }).where(eq(t.reservation.id, r.id))
    left -= take
  }
  if (left > 0) {
    // Unreserved units (e.g. added by an edit when stock was short): take straight from stock.
    if (!(await tryReserveAt(tx, inventoryItemId, locationId, left))) throw apiError(409, 'insufficient_inventory', 'Not enough stock at this location')
    await consumeReservedAt(tx, inventoryItemId, locationId, left)
  }
}

export async function createFulfillment(deps: OrderActionDeps, orderId: string, input: { locationId: string; items: { itemId: string; quantity: number }[]; notify?: boolean }) {
  const o = await loadOrder(deps.db, orderId)
  assertActive(o)
  const id = await deps.withTx(async (tx) => {
    const items = await tx.select().from(t.orderItem).where(eq(t.orderItem.orderId, orderId))
    const lines = input.items.filter((i) => i.quantity > 0)
    if (!lines.length) throw badRequest('Choose at least one item to fulfill')
    for (const l of lines) {
      const item = items.find((i) => i.id === l.itemId)
      if (!item) throw badRequest('Unknown item')
      if (l.quantity > item.quantity - item.fulfilledQuantity) throw badRequest(`Only ${item.quantity - item.fulfilledQuantity} of ${item.title} left to fulfill`)
    }
    const [loc] = await tx.select({ id: t.stockLocation.id, name: t.stockLocation.name }).from(t.stockLocation).where(and(eq(t.stockLocation.id, input.locationId), isNull(t.stockLocation.deletedAt)))
    if (!loc) throw badRequest('Unknown location')
    const [ful] = await tx.insert(t.fulfillment).values({ orderId, locationId: loc.id, packedAt: new Date() }).returning({ id: t.fulfillment.id })
    for (const l of lines) {
      const item = items.find((i) => i.id === l.itemId)!
      const inv = await inventoryItemFor(tx, item.variantId)
      if (inv) await pickStock(tx, item.id, inv, loc.id, l.quantity)
      await tx.insert(t.fulfillmentItem).values({ fulfillmentId: ful!.id, orderItemId: item.id, inventoryItemId: inv, title: item.title, sku: item.sku, quantity: l.quantity })
      await tx.update(t.orderItem).set({ fulfilledQuantity: sql`${t.orderItem.fulfilledQuantity} + ${l.quantity}` }).where(eq(t.orderItem.id, item.id))
    }
    await event(tx, orderId, deps.actor, 'fulfillment.created', `Fulfillment created from ${loc.name}`, 'info', { fulfillmentId: ful!.id })
    await recomputeOrder(tx, orderId)
    return ful!.id
  })
  await deps.emit('order.fulfilled', { id: orderId, fulfillmentId: id })
  return id
}

async function loadFulfillment(db: DbLike, orderId: string, fulfillmentId: string) {
  const [f] = await db.select().from(t.fulfillment).where(and(eq(t.fulfillment.id, fulfillmentId), eq(t.fulfillment.orderId, orderId)))
  if (!f) throw notFound('Fulfillment')
  if (f.canceledAt) throw conflict('This fulfillment was canceled')
  return f
}

export async function shipFulfillment(deps: OrderActionDeps, orderId: string, fulfillmentId: string, tracking: { number: string; carrier?: string | null; url?: string | null }[]) {
  const f = await loadFulfillment(deps.db, orderId, fulfillmentId)
  if (f.shippedAt) throw conflict('Already shipped')
  await deps.withTx(async (tx) => {
    const fItems = await tx.select().from(t.fulfillmentItem).where(eq(t.fulfillmentItem.fulfillmentId, f.id))
    await tx.update(t.fulfillment).set({ shippedAt: new Date() }).where(eq(t.fulfillment.id, f.id))
    for (const i of fItems) await tx.update(t.orderItem).set({ shippedQuantity: sql`${t.orderItem.shippedQuantity} + ${i.quantity}` }).where(eq(t.orderItem.id, i.orderItemId))
    if (tracking.length) await tx.insert(t.fulfillmentTracking).values(tracking.map((x) => ({ fulfillmentId: f.id, trackingNumber: x.number, carrier: x.carrier ?? null, trackingUrl: x.url ?? null })))
    await event(tx, orderId, deps.actor, 'fulfillment.shipped', tracking.length ? `Shipped · ${tracking.map((x) => x.number).join(', ')}` : 'Marked as shipped', 'info')
    await recomputeOrder(tx, orderId)
  })
  await deps.emit('order.shipped', { id: orderId, fulfillmentId })
}

export async function deliverFulfillment(deps: OrderActionDeps, orderId: string, fulfillmentId: string) {
  const f = await loadFulfillment(deps.db, orderId, fulfillmentId)
  if (f.deliveredAt) throw conflict('Already delivered')
  await deps.withTx(async (tx) => {
    const fItems = await tx.select().from(t.fulfillmentItem).where(eq(t.fulfillmentItem.fulfillmentId, f.id))
    await tx.update(t.fulfillment).set({ deliveredAt: new Date(), shippedAt: f.shippedAt ?? new Date() }).where(eq(t.fulfillment.id, f.id))
    for (const i of fItems) {
      await tx
        .update(t.orderItem)
        .set({ deliveredQuantity: sql`${t.orderItem.deliveredQuantity} + ${i.quantity}`, ...(f.shippedAt ? {} : { shippedQuantity: sql`${t.orderItem.shippedQuantity} + ${i.quantity}` }) })
        .where(eq(t.orderItem.id, i.orderItemId))
    }
    await event(tx, orderId, deps.actor, 'fulfillment.delivered', 'Marked as delivered', 'ok')
    await recomputeOrder(tx, orderId)
  })
  await deps.emit('order.delivered', { id: orderId, fulfillmentId })
}

export async function cancelFulfillment(deps: OrderActionDeps, orderId: string, fulfillmentId: string) {
  const f = await loadFulfillment(deps.db, orderId, fulfillmentId)
  if (f.shippedAt) throw conflict("Shipped fulfillments can't be canceled; create a return instead")
  await deps.withTx(async (tx) => {
    const fItems = await tx.select().from(t.fulfillmentItem).where(eq(t.fulfillmentItem.fulfillmentId, f.id))
    for (const i of fItems) {
      if (i.inventoryItemId) {
        // Back on the shelf, and reserved again for this order.
        await restockAt(tx, i.inventoryItemId, f.locationId, i.quantity)
        await tryReserveAt(tx, i.inventoryItemId, f.locationId, i.quantity, true)
        await tx.insert(t.reservation).values({ inventoryItemId: i.inventoryItemId, locationId: f.locationId, quantity: i.quantity, orderId, orderItemId: i.orderItemId, description: 'Fulfillment canceled' })
      }
      await tx.update(t.orderItem).set({ fulfilledQuantity: sql`greatest(${t.orderItem.fulfilledQuantity} - ${i.quantity}, 0)` }).where(eq(t.orderItem.id, i.orderItemId))
    }
    await tx.update(t.fulfillment).set({ canceledAt: new Date() }).where(eq(t.fulfillment.id, f.id))
    await event(tx, orderId, deps.actor, 'fulfillment.canceled', 'Fulfillment canceled', 'neutral')
    await recomputeOrder(tx, orderId)
  })
}

// ── Cancel ──────────────────────────────────────────────────────────────

export async function cancelOrder(deps: OrderActionDeps, orderId: string, reason?: string) {
  const o = await loadOrder(deps.db, orderId)
  assertActive(o)
  const items = await deps.db.select().from(t.orderItem).where(eq(t.orderItem.orderId, orderId))
  if (items.some((i) => i.shippedQuantity > 0)) throw conflict('Part of this order has shipped. Create a return instead.')
  const openFulfillments = await deps.db.select({ id: t.fulfillment.id }).from(t.fulfillment).where(and(eq(t.fulfillment.orderId, orderId), isNull(t.fulfillment.canceledAt)))
  for (const f of openFulfillments) await cancelFulfillment(deps, orderId, f.id)

  // Money first: void authorizations, refund captures.
  const payments = await deps.db.select().from(t.payment).where(and(eq(t.payment.orderId, orderId), isNull(t.payment.canceledAt)))
  const refundable = payments.reduce((a, p) => a + p.capturedAmount - p.refundedAmount, 0)
  if (refundable > 0) await refundPayment(deps, orderId, refundable, { reason: 'canceled' })
  for (const p of payments.filter((x) => x.capturedAmount === 0)) await deps.provider(p.providerId).cancel(p.data)

  await deps.withTx(async (tx) => {
    const reservations = await tx.select().from(t.reservation).where(eq(t.reservation.orderId, orderId))
    for (const r of reservations) await releaseAt(tx, r.inventoryItemId, r.locationId, r.quantity)
    if (reservations.length) await tx.delete(t.reservation).where(inArray(t.reservation.id, reservations.map((r) => r.id)))
    await tx.update(t.payment).set({ canceledAt: new Date() }).where(and(eq(t.payment.orderId, orderId), eq(t.payment.capturedAmount, 0)))
    await tx.update(t.order).set({ status: 'canceled', canceledAt: new Date() }).where(eq(t.order.id, orderId))
    await event(tx, orderId, deps.actor, 'order.canceled', reason ? `Order canceled: ${reason}` : 'Order canceled', 'neutral')
    await recomputeOrder(tx, orderId)
  })
  await deps.emit('order.canceled', { id: orderId })
}

// ── Returns ─────────────────────────────────────────────────────────────

export async function requestReturn(deps: OrderActionDeps, orderId: string, input: { items: { itemId: string; quantity: number; reasonId?: string | null; note?: string | null }[]; locationId?: string | null; note?: string | null }, exchangeId?: string) {
  const o = await loadOrder(deps.db, orderId)
  assertActive(o)
  const id = await deps.withTx(async (tx) => {
    const items = await tx.select().from(t.orderItem).where(eq(t.orderItem.orderId, orderId))
    const pending = await tx
      .select({ orderItemId: t.returnItem.orderItemId, quantity: t.returnItem.quantity })
      .from(t.returnItem)
      .innerJoin(t.orderReturn, eq(t.orderReturn.id, t.returnItem.returnId))
      .where(and(eq(t.orderReturn.orderId, orderId), eq(t.orderReturn.status, 'requested')))
    const lines = input.items.filter((i) => i.quantity > 0)
    if (!lines.length) throw badRequest('Choose at least one item to return')
    let value = 0
    for (const l of lines) {
      const item = items.find((i) => i.id === l.itemId)
      if (!item) throw badRequest('Unknown item')
      const open = pending.filter((p) => p.orderItemId === item.id).reduce((a, p) => a + p.quantity, 0)
      const returnable = item.fulfilledQuantity - item.returnedQuantity - open
      if (l.quantity > returnable) throw badRequest(`Only ${Math.max(0, returnable)} of ${item.title} can be returned`)
      value += divRound(item.total * l.quantity, item.quantity)
    }
    const [ret] = await tx.insert(t.orderReturn).values({ orderId, exchangeId, locationId: input.locationId ?? null, refundAmount: value, note: input.note ?? null }).returning({ id: t.orderReturn.id })
    await tx.insert(t.returnItem).values(lines.map((l) => ({ returnId: ret!.id, orderItemId: l.itemId, quantity: l.quantity, reasonId: l.reasonId ?? null, note: l.note ?? null })))
    await event(tx, orderId, deps.actor, 'return.requested', `Return requested for ${lines.reduce((a, l) => a + l.quantity, 0)} item(s)`, 'warn', { returnId: ret!.id })
    return ret!.id
  })
  await deps.emit('return.requested', { id: orderId, returnId: id })
  return id
}

export async function receiveReturn(deps: OrderActionDeps, orderId: string, returnId: string, input: { locationId: string; refund: boolean; refundAmount?: number; items?: { returnItemId: string; quantity: number }[] }) {
  const [ret] = await deps.db.select().from(t.orderReturn).where(and(eq(t.orderReturn.id, returnId), eq(t.orderReturn.orderId, orderId)))
  if (!ret) throw notFound('Return')
  if (ret.status !== 'requested') throw conflict(`This return is already ${ret.status}`)
  const [loc] = await deps.db.select({ id: t.stockLocation.id, name: t.stockLocation.name }).from(t.stockLocation).where(eq(t.stockLocation.id, input.locationId))
  if (!loc) throw badRequest('Unknown location')

  let refundValue = 0
  await deps.withTx(async (tx) => {
    const rItems = await tx.select().from(t.returnItem).where(eq(t.returnItem.returnId, returnId))
    const items = await tx.select().from(t.orderItem).where(inArray(t.orderItem.id, rItems.map((r) => r.orderItemId)))
    for (const r of rItems) {
      const qty = Math.min(r.quantity, input.items?.find((x) => x.returnItemId === r.id)?.quantity ?? r.quantity)
      const item = items.find((i) => i.id === r.orderItemId)!
      const inv = await inventoryItemFor(tx, item.variantId)
      if (inv && qty > 0) await restockAt(tx, inv, loc.id, qty)
      await tx.update(t.returnItem).set({ receivedQuantity: qty }).where(eq(t.returnItem.id, r.id))
      await tx.update(t.orderItem).set({ returnedQuantity: sql`${t.orderItem.returnedQuantity} + ${qty}` }).where(eq(t.orderItem.id, item.id))
      refundValue += divRound(item.total * qty, item.quantity)
    }
    await tx.update(t.orderReturn).set({ status: 'received', receivedAt: new Date(), locationId: loc.id, refundAmount: input.refundAmount ?? refundValue }).where(eq(t.orderReturn.id, returnId))
    await event(tx, orderId, deps.actor, 'return.received', `Return received at ${loc.name}`, 'neutral', { returnId })
  })
  const refund = input.refundAmount ?? refundValue
  if (ret.exchangeId) await completeExchange(deps, orderId, ret.exchangeId, refund)
  else if (input.refund && refund > 0) await refundPayment(deps, orderId, refund, { reason: 'return', returnId })
  await deps.withTx((tx) => recomputeOrder(tx, orderId))
  await deps.emit('return.received', { id: orderId, returnId })
}

export async function cancelReturn(deps: OrderActionDeps, orderId: string, returnId: string) {
  const [row] = await deps.db.update(t.orderReturn).set({ status: 'canceled' }).where(and(eq(t.orderReturn.id, returnId), eq(t.orderReturn.orderId, orderId), eq(t.orderReturn.status, 'requested'))).returning({ exchangeId: t.orderReturn.exchangeId })
  if (!row) throw conflict('Only requested returns can be canceled')
  if (row.exchangeId) await deps.db.update(t.exchange).set({ status: 'canceled' }).where(eq(t.exchange.id, row.exchangeId))
  await event(deps.db, orderId, deps.actor, 'return.canceled', 'Return canceled')
}

// ── Exchanges ───────────────────────────────────────────────────────────

export async function createExchange(deps: OrderActionDeps, orderId: string, input: { returnItems: { itemId: string; quantity: number; reasonId?: string | null }[]; newItems: { variantId: string; quantity: number }[]; locationId?: string | null; note?: string | null }) {
  const o = await loadOrder(deps.db, orderId)
  assertActive(o)
  if (!input.newItems.length) throw badRequest('Add at least one replacement item')
  const prices = await calculatePrices(deps.db, input.newItems.map((i) => i.variantId), { regionId: o.regionId, currencyCode: o.currencyCode })
  const variants = await deps.db
    .select({ id: t.productVariant.id, title: t.productVariant.title, productTitle: t.product.title })
    .from(t.productVariant)
    .innerJoin(t.product, eq(t.product.id, t.productVariant.productId))
    .where(inArray(t.productVariant.id, input.newItems.map((i) => i.variantId)))
  const newLines = input.newItems.map((n) => {
    const v = variants.find((x) => x.id === n.variantId)
    const p = prices.get(n.variantId)
    if (!v || !p) throw badRequest('A replacement item has no price in this order’s currency')
    return { variantId: n.variantId, title: `${v.productTitle} · ${v.title}`, quantity: n.quantity, unitPrice: p.amount }
  })
  const newTotal = newLines.reduce((a, l) => a + l.unitPrice * l.quantity, 0)
  const [ex] = await deps.db.insert(t.exchange).values({ orderId, note: input.note ?? null }).returning({ id: t.exchange.id })
  const returnId = await requestReturn(deps, orderId, { items: input.returnItems, locationId: input.locationId, note: input.note }, ex!.id)
  const [ret] = await deps.db.select({ refundAmount: t.orderReturn.refundAmount }).from(t.orderReturn).where(eq(t.orderReturn.id, returnId))
  const differenceDue = newTotal - (ret?.refundAmount ?? 0)
  await deps.db.update(t.exchange).set({ returnId, differenceDue }).where(eq(t.exchange.id, ex!.id))
  await deps.db.insert(t.exchangeItem).values(newLines.map((l) => ({ exchangeId: ex!.id, ...l })))
  await event(deps.db, orderId, deps.actor, 'exchange.created', `Exchange created · difference ${differenceDue >= 0 ? 'due' : 'to refund'}: ${Math.abs(differenceDue)}`, 'warn', { exchangeId: ex!.id, differenceDue })
  await deps.emit('exchange.created', { id: orderId, exchangeId: ex!.id })
  return ex!.id
}

/** When the returned goods arrive: add the replacements to the order and settle the difference. */
async function completeExchange(deps: OrderActionDeps, orderId: string, exchangeId: string, returnValue: number) {
  const [ex] = await deps.db.select().from(t.exchange).where(eq(t.exchange.id, exchangeId))
  if (!ex || ex.status !== 'requested') return
  const xItems = await deps.db.select().from(t.exchangeItem).where(eq(t.exchangeItem.exchangeId, exchangeId))
  const o = await loadOrder(deps.db, orderId)
  const newTotal = xItems.reduce((a, i) => a + i.unitPrice * i.quantity, 0)
  const difference = newTotal - returnValue
  await deps.withTx(async (tx) => {
    const [rate] = await tx.select({ rateBps: t.taxRate.rateBps }).from(t.taxRate).where(and(eq(t.taxRate.regionId, o.regionId), eq(t.taxRate.isDefault, true), isNull(t.taxRate.deletedAt)))
    for (const x of xItems) {
      const lt = computeTotals({ items: [{ id: x.id, unitPrice: x.unitPrice, quantity: x.quantity, taxRateBps: rate?.rateBps ?? 0, isTaxInclusive: o.isTaxInclusive }] }).items[0]!
      const [variant] = await tx.select({ productId: t.productVariant.productId, sku: t.productVariant.sku }).from(t.productVariant).where(eq(t.productVariant.id, x.variantId))
      const [item] = await tx
        .insert(t.orderItem)
        .values({ orderId, variantId: x.variantId, productId: variant?.productId ?? null, title: x.title, sku: variant?.sku ?? null, quantity: x.quantity, unitPrice: x.unitPrice, subtotal: lt.subtotal, taxTotal: lt.taxTotal, total: lt.total, taxRateBps: rate?.rateBps ?? 0, isTaxInclusive: o.isTaxInclusive, metadata: { exchangeId } })
        .returning({ id: t.orderItem.id })
      const inv = await inventoryItemFor(tx, x.variantId)
      if (inv) {
        const [loc] = await tx.select({ id: t.store.defaultLocationId }).from(t.store).limit(1)
        if (loc?.id && (await tryReserveAt(tx, inv, loc.id, x.quantity, true))) {
          await tx.insert(t.reservation).values({ inventoryItemId: inv, locationId: loc.id, quantity: x.quantity, orderId, orderItemId: item!.id, description: 'Exchange' })
        }
      }
    }
    await tx.update(t.order).set({ total: sql`${t.order.total} + ${difference}`, itemSubtotal: sql`${t.order.itemSubtotal} + ${newTotal}` }).where(eq(t.order.id, orderId))
    await tx.update(t.exchange).set({ status: 'completed', differenceDue: difference }).where(eq(t.exchange.id, exchangeId))
    if (difference !== 0) await tx.insert(t.orderTransaction).values({ orderId, kind: 'difference', amount: difference, currencyCode: o.currencyCode, note: 'Exchange difference' })
    await event(tx, orderId, deps.actor, 'exchange.completed', difference > 0 ? `Exchange completed · ${difference} due from customer` : difference < 0 ? `Exchange completed · ${-difference} to refund` : 'Exchange completed', 'info', { exchangeId })
  })
  if (difference < 0) await refundPayment(deps, orderId, -difference, { reason: 'exchange' }).catch(() => undefined)
}

// ── Edits ───────────────────────────────────────────────────────────────

export type EditAction = { action: 'item_update'; itemId: string; quantity: number } | { action: 'item_add'; variantId: string; quantity: number } | { action: 'item_remove'; itemId: string }

interface PreviewLine {
  itemId?: string
  variantId: string | null
  title: string
  quantity: number
  unitPrice: number
  discountPerUnit: number
  taxRateBps: number
}

async function previewEdit(db: DbLike, o: OrderRow, actions: EditAction[]) {
  const items = await db.select().from(t.orderItem).where(eq(t.orderItem.orderId, o.id))
  const lines: PreviewLine[] = items.map((i) => ({ itemId: i.id, variantId: i.variantId, title: i.title, quantity: i.quantity, unitPrice: i.unitPrice, discountPerUnit: i.quantity ? Math.floor(i.discountTotal / i.quantity) : 0, taxRateBps: i.taxRateBps }))
  const [rate] = await db.select({ rateBps: t.taxRate.rateBps }).from(t.taxRate).where(and(eq(t.taxRate.regionId, o.regionId), eq(t.taxRate.isDefault, true), isNull(t.taxRate.deletedAt)))
  for (const a of actions) {
    if (a.action === 'item_add') {
      const price = (await calculatePrices(db, [a.variantId], { regionId: o.regionId, currencyCode: o.currencyCode, quantity: a.quantity })).get(a.variantId)
      const [v] = await db.select({ title: t.productVariant.title, productTitle: t.product.title }).from(t.productVariant).innerJoin(t.product, eq(t.product.id, t.productVariant.productId)).where(eq(t.productVariant.id, a.variantId))
      if (!price || !v) throw badRequest('That variant has no price in this order’s currency')
      lines.push({ variantId: a.variantId, title: v.productTitle, quantity: a.quantity, unitPrice: price.amount, discountPerUnit: 0, taxRateBps: rate?.rateBps ?? 0 })
      continue
    }
    const line = lines.find((l) => l.itemId === a.itemId)
    const item = items.find((i) => i.id === a.itemId)
    if (!line || !item) throw badRequest('Unknown item')
    const qty = a.action === 'item_remove' ? 0 : a.quantity
    if (qty < item.fulfilledQuantity) throw badRequest(`${item.title}: ${item.fulfilledQuantity} already fulfilled`)
    line.quantity = qty
  }
  const shipping = await db.select().from(t.orderShippingMethod).where(eq(t.orderShippingMethod.orderId, o.id))
  const totals = computeTotals({
    items: lines.map((l, idx) => ({ id: String(idx), unitPrice: l.unitPrice, quantity: l.quantity, taxRateBps: l.taxRateBps, isTaxInclusive: o.isTaxInclusive, discount: l.discountPerUnit * l.quantity })),
    shippingMethods: shipping.map((s) => ({ id: s.id, amount: s.amount, taxRateBps: lines[0]?.taxRateBps ?? 0, isTaxInclusive: o.isTaxInclusive, discount: s.discountTotal })),
  })
  return { lines, totals, items }
}

export async function proposeEdit(deps: OrderActionDeps, orderId: string, actions: EditAction[], note?: string) {
  const o = await loadOrder(deps.db, orderId)
  assertActive(o)
  if (!actions.length) throw badRequest('Make at least one change')
  const [open] = await deps.db.select({ id: t.orderChange.id }).from(t.orderChange).where(and(eq(t.orderChange.orderId, orderId), eq(t.orderChange.status, 'proposed')))
  if (open) throw conflict('This order already has a proposed edit. Confirm or decline it first.')
  const { totals } = await previewEdit(deps.db, o, actions)
  const differenceDue = totals.total - o.total
  const [change] = await deps.db
    .insert(t.orderChange)
    .values({ orderId, version: o.version + 1, type: 'edit', actions: actions as t.OrderChangeAction[], differenceDue, note: note ?? null, createdBy: deps.actor.id })
    .returning()
  await event(deps.db, orderId, deps.actor, 'edit.proposed', `Edit proposed · new total ${totals.total}`, 'warn', { changeId: change!.id, differenceDue })
  return { change: change!, newTotal: totals.total, differenceDue }
}

export async function confirmEdit(deps: OrderActionDeps, orderId: string, changeId: string) {
  const o = await loadOrder(deps.db, orderId)
  assertActive(o)
  const [change] = await deps.db.select().from(t.orderChange).where(and(eq(t.orderChange.id, changeId), eq(t.orderChange.orderId, orderId)))
  if (!change || change.status !== 'proposed') throw conflict('This edit is no longer open')
  const { lines, totals, items } = await previewEdit(deps.db, o, change.actions as EditAction[])
  const difference = totals.total - o.total
  await deps.withTx(async (tx) => {
    await tx.insert(t.orderVersion).values({ orderId, version: o.version, snapshot: { order: o, items } })
    for (const [idx, l] of lines.entries()) {
      const lt = totals.items[idx]!
      if (l.itemId) {
        const prev = items.find((i) => i.id === l.itemId)!
        if (prev.quantity === l.quantity) continue
        await tx.update(t.orderItem).set({ quantity: l.quantity, subtotal: lt.subtotal, discountTotal: lt.discountTotal, taxTotal: lt.taxTotal, total: lt.total }).where(eq(t.orderItem.id, l.itemId))
        const inv = await inventoryItemFor(tx, prev.variantId)
        if (inv && l.quantity < prev.quantity) {
          // Release the reservation for the units no longer ordered.
          let release = Math.min(prev.quantity - l.quantity, prev.quantity - prev.fulfilledQuantity)
          for (const r of await tx.select().from(t.reservation).where(eq(t.reservation.orderItemId, l.itemId))) {
            if (release <= 0) break
            const take = Math.min(release, r.quantity)
            await releaseAt(tx, inv, r.locationId, take)
            if (take === r.quantity) await tx.delete(t.reservation).where(eq(t.reservation.id, r.id))
            else await tx.update(t.reservation).set({ quantity: r.quantity - take }).where(eq(t.reservation.id, r.id))
            release -= take
          }
        } else if (inv && l.quantity > prev.quantity) {
          await reserveForItem(tx, inv, orderId, l.itemId, l.quantity - prev.quantity)
        }
      } else {
        const [variant] = await tx.select({ productId: t.productVariant.productId, sku: t.productVariant.sku, title: t.productVariant.title }).from(t.productVariant).where(eq(t.productVariant.id, l.variantId!))
        const [item] = await tx
          .insert(t.orderItem)
          .values({ orderId, variantId: l.variantId, productId: variant?.productId ?? null, title: l.title, variantTitle: variant?.title ?? null, sku: variant?.sku ?? null, quantity: l.quantity, unitPrice: l.unitPrice, subtotal: lt.subtotal, taxTotal: lt.taxTotal, total: lt.total, taxRateBps: l.taxRateBps, isTaxInclusive: o.isTaxInclusive })
          .returning({ id: t.orderItem.id })
        const inv = await inventoryItemFor(tx, l.variantId)
        if (inv) await reserveForItem(tx, inv, orderId, item!.id, l.quantity)
      }
    }
    await tx
      .update(t.order)
      .set({ version: o.version + 1, itemSubtotal: totals.itemSubtotal, subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total })
      .where(eq(t.order.id, orderId))
    await tx.update(t.orderChange).set({ status: 'confirmed', confirmedAt: new Date(), confirmedBy: deps.actor.id, differenceDue: difference }).where(eq(t.orderChange.id, changeId))
    if (difference !== 0) await tx.insert(t.orderTransaction).values({ orderId, kind: 'difference', amount: difference, currencyCode: o.currencyCode, note: `Order edit v${o.version + 1}` })
    await event(tx, orderId, deps.actor, 'edit.confirmed', `Order edited (v${o.version + 1})${difference > 0 ? ` · ${difference} due` : difference < 0 ? ` · ${-difference} to refund` : ''}`, 'info', { changeId, difference })
    await recomputeOrder(tx, orderId)
  })
  // A lower total refunds the captured overage automatically.
  if (difference < 0) {
    const payments = await deps.db.select().from(t.payment).where(eq(t.payment.orderId, orderId))
    const netPaid = payments.reduce((a, p) => a + p.capturedAmount - p.refundedAmount, 0)
    const overpaid = netPaid - totals.total
    if (overpaid > 0) await refundPayment(deps, orderId, overpaid, { reason: 'order edit' })
  }
  await deps.emit('order.updated', { id: orderId, version: o.version + 1 })
}

async function reserveForItem(tx: Tx, inventoryItemId: string, orderId: string, orderItemId: string, qty: number) {
  const [loc] = await tx.select({ id: t.store.defaultLocationId }).from(t.store).limit(1)
  const levels = await tx.select({ locationId: t.inventoryLevel.locationId }).from(t.inventoryLevel).where(eq(t.inventoryLevel.inventoryItemId, inventoryItemId))
  const ordered = [...levels].sort((a, b) => Number(b.locationId === loc?.id) - Number(a.locationId === loc?.id))
  for (const l of ordered) {
    if (await tryReserveAt(tx, inventoryItemId, l.locationId, qty)) {
      await tx.insert(t.reservation).values({ inventoryItemId, locationId: l.locationId, quantity: qty, orderId, orderItemId, description: 'Order edit' })
      return
    }
  }
  throw apiError(409, 'insufficient_inventory', 'Not enough stock for the edited quantity')
}

export async function declineEdit(deps: OrderActionDeps, orderId: string, changeId: string) {
  const [row] = await deps.db.update(t.orderChange).set({ status: 'declined' }).where(and(eq(t.orderChange.id, changeId), eq(t.orderChange.orderId, orderId), eq(t.orderChange.status, 'proposed'))).returning({ id: t.orderChange.id })
  if (!row) throw conflict('This edit is no longer open')
  await event(deps.db, orderId, deps.actor, 'edit.declined', 'Edit declined')
}

// ── Allocate ────────────────────────────────────────────────────────────

/** Reserve stock for any unfulfilled quantity that isn't reserved yet. Returns what couldn't be allocated. */
export async function allocateStock(deps: OrderActionDeps, orderId: string): Promise<{ allocated: number; short: { title: string; quantity: number }[] }> {
  const o = await loadOrder(deps.db, orderId)
  assertActive(o)
  let allocated = 0
  const short: { title: string; quantity: number }[] = []
  await deps.withTx(async (tx) => {
    const items = await tx.select().from(t.orderItem).where(eq(t.orderItem.orderId, orderId))
    const reservations = await tx.select().from(t.reservation).where(eq(t.reservation.orderId, orderId))
    for (const item of items) {
      const need = item.quantity - item.fulfilledQuantity - reservations.filter((r) => r.orderItemId === item.id).reduce((a, r) => a + r.quantity, 0)
      if (need <= 0) continue
      const inv = await inventoryItemFor(tx, item.variantId)
      if (!inv) continue
      try {
        await reserveForItem(tx, inv, orderId, item.id, need)
        allocated += need
      } catch {
        short.push({ title: `${item.title}${item.variantTitle ? ` · ${item.variantTitle}` : ''}`, quantity: need })
      }
    }
    await event(tx, orderId, deps.actor, 'stock.allocated', allocated ? `Allocated ${allocated} unit(s)` : 'All items already allocated', short.length ? 'warn' : 'info', { short })
  })
  return { allocated, short }
}
