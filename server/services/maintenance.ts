/** Scheduled housekeeping. Each job is idempotent and safe to run concurrently or twice. */
import { and, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import * as t from '../db/schema'
import { releaseAt } from './inventory'

/** Release checkout reservations that never turned into an order (e.g. abandoned payment). */
export async function releaseStaleReservations(db: DbLike, now = new Date()) {
  const stale = await db.select().from(t.reservation).where(and(isNull(t.reservation.orderId), isNotNull(t.reservation.expiresAt), lt(t.reservation.expiresAt, now))).limit(500)
  for (const r of stale) {
    // Delete first so a concurrent run can't release the same reservation twice.
    const [gone] = await db.delete(t.reservation).where(eq(t.reservation.id, r.id)).returning({ id: t.reservation.id })
    if (gone) await releaseAt(db, r.inventoryItemId, r.locationId, r.quantity)
  }
  return { released: stale.length }
}

/** Delete expired, never-completed carts (line items, methods and promotions cascade). */
export async function expireCarts(db: DbLike, now = new Date()) {
  const expired = await db.select({ id: t.cart.id }).from(t.cart).where(and(isNull(t.cart.completedAt), isNotNull(t.cart.expiresAt), lt(t.cart.expiresAt, now))).limit(500)
  if (!expired.length) return { expired: 0 }
  const ids = expired.map((c) => c.id)
  const reservations = await db.select().from(t.reservation).where(and(inArray(t.reservation.cartId, ids), isNull(t.reservation.orderId)))
  for (const r of reservations) {
    const [gone] = await db.delete(t.reservation).where(eq(t.reservation.id, r.id)).returning({ id: t.reservation.id })
    if (gone) await releaseAt(db, r.inventoryItemId, r.locationId, r.quantity)
  }
  await db.delete(t.paymentCollection).where(and(inArray(t.paymentCollection.cartId, ids), isNull(t.paymentCollection.orderId)))
  await db.delete(t.cart).where(inArray(t.cart.id, ids))
  return { expired: ids.length }
}
