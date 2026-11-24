/**
 * Provider webhooks → our state. Idempotent: each provider event id is processed once.
 * A captured payment for a cart that never completed (customer closed the tab after paying)
 * completes the cart server-side so the money always ends up attached to an order.
 */
import { and, eq, sql } from 'drizzle-orm'
import * as t from '../db/schema'
import type { WebhookEvent } from '../providers/payment/types'
import { completeCart, type CheckoutDeps } from './checkout'

export async function handlePaymentWebhook(deps: CheckoutDeps, providerId: string, evt: WebhookEvent): Promise<{ processed: boolean; reason?: string }> {
  const { db } = deps
  const key = `webhook:${providerId}:${evt.id}`
  const [claimed] = await db.insert(t.idempotencyKey).values({ key, scope: `webhook:${providerId}`, requestHash: evt.id, responseStatus: 200 }).onConflictDoNothing().returning({ key: t.idempotencyKey.key })
  if (!claimed) return { processed: false, reason: 'duplicate' }
  if (evt.type === 'ignored') return { processed: false, reason: 'ignored' }

  const [session] = evt.sessionId
    ? await db.select().from(t.paymentSession).where(eq(t.paymentSession.id, evt.sessionId))
    : evt.providerReference
      ? await db.select().from(t.paymentSession).where(sql`${t.paymentSession.data}->>'paymentIntentId' = ${evt.providerReference} or ${t.paymentSession.data}->>'reference' = ${evt.providerReference}`)
      : []
  if (!session) return { processed: false, reason: 'unknown_session' }
  const [collection] = await db.select().from(t.paymentCollection).where(eq(t.paymentCollection.id, session.paymentCollectionId))

  if (evt.type === 'payment.failed') {
    await db.update(t.paymentSession).set({ status: 'error' }).where(eq(t.paymentSession.id, session.id))
    return { processed: true }
  }

  if (evt.type === 'payment.authorized' || evt.type === 'payment.captured') {
    if (collection?.cartId && !collection.orderId) {
      try {
        await completeCart(deps, collection.cartId)
      } catch (err) {
        console.error(`[webhook:${providerId}] could not auto-complete cart ${collection.cartId}`, err instanceof Error ? err.message : err)
        return { processed: true, reason: 'cart_not_completable' }
      }
    }
    if (evt.type === 'payment.captured') await markCaptured(deps, session.id, evt.amount ?? session.amount)
    return { processed: true }
  }

  if (evt.type === 'payment.refunded') {
    const [pay] = await db.select().from(t.payment).where(eq(t.payment.paymentSessionId, session.id))
    if (pay?.orderId) await db.insert(t.orderEvent).values({ orderId: pay.orderId, type: 'payment.refund_confirmed', message: `${providerId} confirmed a refund`, tone: 'neutral' })
    return { processed: true }
  }
  return { processed: false }
}

/** Capture confirmed by the provider (e.g. Stripe capture made in the dashboard). No-op if already captured. */
async function markCaptured(deps: CheckoutDeps, sessionId: string, amount: number) {
  await deps.withTx(async (tx) => {
    const [pay] = await tx.update(t.payment).set({ capturedAmount: amount, capturedAt: new Date() }).where(and(eq(t.payment.paymentSessionId, sessionId), sql`${t.payment.capturedAmount} < ${amount}`)).returning()
    if (!pay?.orderId) return
    await tx.update(t.paymentCollection).set({ capturedAmount: amount, status: 'completed' }).where(eq(t.paymentCollection.id, pay.paymentCollectionId))
    await tx.update(t.order).set({ paymentStatus: 'captured', paidTotal: amount }).where(eq(t.order.id, pay.orderId))
    await tx.insert(t.orderTransaction).values({ orderId: pay.orderId, paymentId: pay.id, kind: 'capture', amount, currencyCode: pay.currencyCode, providerId: pay.providerId, reference: pay.providerReference })
    await tx.insert(t.orderEvent).values({ orderId: pay.orderId, type: 'payment.captured', message: `Payment captured (${pay.providerId} webhook)`, tone: 'ok' })
  })
}
