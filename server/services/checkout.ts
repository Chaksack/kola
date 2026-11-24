/**
 * Checkout: shipping options, payment sessions and the cart → order completion workflow.
 *
 * Completion is a saga: validate → reserve inventory → authorize payment → create order (one
 * transaction) → mark promotions used. If a step fails, earlier steps are compensated in reverse
 * (reservations released, payment voided or refunded). Domain events are emitted after commit.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DbLike, Tx } from '../db/client'
import * as t from '../db/schema'
import type { PaymentProvider, PaymentSessionStatus, ProviderResult } from '../providers/payment/types'
import { assertOpen, getCartView, loadCart, type CartRow, type CartView } from './cart'
import { apiError, badRequest, notFound } from './errors'
import { releaseAt, reserveAnywhere } from './inventory'
import { runWorkflow, WorkflowError } from './workflow'

// ── Shipping ────────────────────────────────────────────────────────────

export interface AvailableShippingOption {
  id: string
  name: string
  description: string | null
  amount: number
  currencyCode: string
  shippingProfileId: string
  locationId: string
}

export async function listShippingOptions(db: DbLike, view: CartView): Promise<AvailableShippingOption[]> {
  const profileIds = [...new Set(view.items.map((i) => i.shippingProfileId).filter((x): x is string => Boolean(x)))]
  if (!profileIds.length) return []
  const country = view.shippingAddress?.countryCode?.toLowerCase()
  const regionCountries = (await db.select({ iso2: t.regionCountry.iso2 }).from(t.regionCountry).where(eq(t.regionCountry.regionId, view.regionId))).map((c) => c.iso2)
  const countries = country ? [country] : regionCountries
  if (!countries.length) return []

  const rows = await db
    .selectDistinct({
      id: t.shippingOption.id,
      name: t.shippingOption.name,
      description: t.shippingOption.description,
      shippingProfileId: t.shippingOption.shippingProfileId,
      rules: t.shippingOption.rules,
      locationId: t.serviceZone.locationId,
      createdAt: t.shippingOption.createdAt,
    })
    .from(t.shippingOption)
    .innerJoin(t.serviceZone, eq(t.serviceZone.id, t.shippingOption.serviceZoneId))
    .innerJoin(t.serviceZoneCountry, eq(t.serviceZoneCountry.serviceZoneId, t.serviceZone.id))
    .innerJoin(t.stockLocation, and(eq(t.stockLocation.id, t.serviceZone.locationId), isNull(t.stockLocation.deletedAt)))
    .where(
      and(
        isNull(t.shippingOption.deletedAt),
        eq(t.shippingOption.isReturn, false),
        eq(t.shippingOption.adminOnly, false),
        inArray(t.shippingOption.shippingProfileId, profileIds),
        inArray(t.serviceZoneCountry.countryCode, countries),
      ),
    )
    .orderBy(t.shippingOption.createdAt)
  if (!rows.length) return []
  const prices = await db.select().from(t.shippingOptionPrice).where(and(inArray(t.shippingOptionPrice.shippingOptionId, rows.map((r) => r.id)), eq(t.shippingOptionPrice.currencyCode, view.currencyCode)))
  const subtotal = view.totals.itemSubtotal
  return rows.flatMap((r) => {
    const price = prices.filter((p) => p.shippingOptionId === r.id).sort((a, b) => Number(b.regionId === view.regionId) - Number(a.regionId === view.regionId)).find((p) => !p.regionId || p.regionId === view.regionId)
    if (!price) return []
    const rulesOk = r.rules.every((rule) => {
      if (rule.attribute !== 'subtotal') return true
      const v = Number(rule.value)
      return rule.operator === 'gte' ? subtotal >= v : rule.operator === 'lte' ? subtotal <= v : subtotal === v
    })
    if (!rulesOk) return []
    return [{ id: r.id, name: r.name, description: r.description, amount: price.amount, currencyCode: view.currencyCode, shippingProfileId: r.shippingProfileId, locationId: r.locationId }]
  })
}

/** Choose a shipping option. One method per shipping profile; picking another replaces it. */
export async function setShippingMethod(db: DbLike, cart: CartRow, optionId: string) {
  assertOpen(cart)
  const view = await getCartView(db, cart.id)
  const option = (await listShippingOptions(db, view)).find((o) => o.id === optionId)
  if (!option) throw badRequest('This shipping option is not available for your cart', [{ path: 'optionId', message: 'Unavailable' }])
  const [region] = await db.select({ taxInclusive: t.region.taxInclusive }).from(t.region).where(eq(t.region.id, cart.regionId))
  const existing = await db.select().from(t.cartShippingMethod).where(eq(t.cartShippingMethod.cartId, cart.id))
  const replace = existing.filter((m) => (m.data?.shippingProfileId ?? null) === option.shippingProfileId || !m.data?.shippingProfileId).map((m) => m.id)
  if (replace.length) await db.delete(t.cartShippingMethod).where(inArray(t.cartShippingMethod.id, replace))
  await db.insert(t.cartShippingMethod).values({
    cartId: cart.id,
    shippingOptionId: option.id,
    name: option.name,
    amount: option.amount,
    isTaxInclusive: region?.taxInclusive ?? false,
    data: { shippingProfileId: option.shippingProfileId, locationId: option.locationId },
  })
}

// ── Payment sessions ────────────────────────────────────────────────────

export interface CheckoutDeps {
  db: DbLike
  withTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
  provider: (id: string) => PaymentProvider
  emit: (name: 'order.placed', data: Record<string, unknown>) => Promise<unknown>
}

export async function enabledProviders(db: DbLike, regionId: string): Promise<string[]> {
  const rows = await db.select({ id: t.regionPaymentProvider.providerId }).from(t.regionPaymentProvider).where(eq(t.regionPaymentProvider.regionId, regionId))
  return rows.map((r) => r.id)
}

async function activeSession(db: DbLike, cartId: string) {
  const [row] = await db
    .select({ session: t.paymentSession, collection: t.paymentCollection })
    .from(t.paymentSession)
    .innerJoin(t.paymentCollection, eq(t.paymentCollection.id, t.paymentSession.paymentCollectionId))
    .where(and(eq(t.paymentCollection.cartId, cartId), isNull(t.paymentCollection.orderId), sql`${t.paymentSession.status} <> 'canceled'`))
    .orderBy(desc(t.paymentSession.createdAt))
    .limit(1)
  return row ?? null
}

/** Start (or restart) payment with a provider for the cart's current total. */
export async function createPaymentSession(deps: CheckoutDeps, cartId: string, providerId: string) {
  const { db } = deps
  const cart = await loadCart(db, cartId)
  assertOpen(cart)
  if (!(await enabledProviders(db, cart.regionId)).includes(providerId)) throw badRequest('This payment method is not available in your region')
  const view = await getCartView(db, cartId)
  if (!view.items.length) throw badRequest('Your cart is empty')
  if (!view.email) throw badRequest('Add your email before paying', [{ path: 'email', message: 'Required' }])
  const provider = deps.provider(providerId)

  // Cancel any earlier session so only one can complete.
  const prev = await activeSession(db, cartId)
  if (prev) {
    await provider.cancel(prev.session.data).catch(() => undefined)
    await db.update(t.paymentSession).set({ status: 'canceled' }).where(eq(t.paymentSession.id, prev.session.id))
  }
  const [collection] = prev
    ? await db.update(t.paymentCollection).set({ amount: view.totals.total, currencyCode: view.currencyCode, status: 'not_paid' }).where(eq(t.paymentCollection.id, prev.collection.id)).returning()
    : await db.insert(t.paymentCollection).values({ cartId, amount: view.totals.total, currencyCode: view.currencyCode }).returning()
  const [session] = await db
    .insert(t.paymentSession)
    .values({ paymentCollectionId: collection!.id, providerId, amount: view.totals.total, currencyCode: view.currencyCode })
    .returning()
  const result = await provider.initiate({ amount: view.totals.total, currencyCode: view.currencyCode, email: view.email, reference: session!.id, metadata: { cart_id: cartId } })
  const [updated] = await db.update(t.paymentSession).set({ status: result.status, data: result.data }).where(eq(t.paymentSession.id, session!.id)).returning()
  await db.update(t.paymentCollection).set({ status: 'awaiting' }).where(eq(t.paymentCollection.id, collection!.id))
  return publicSession(updated!)
}

export function publicSession(s: typeof t.paymentSession.$inferSelect) {
  // Only what the browser needs to finish payment.
  const d = s.data as Record<string, unknown>
  return { id: s.id, providerId: s.providerId, amount: s.amount, currencyCode: s.currencyCode, status: s.status, data: { accessCode: d.accessCode, reference: d.reference, clientSecret: d.clientSecret } }
}

// ── Completion ──────────────────────────────────────────────────────────

export class PaymentRequiredError extends Error {
  constructor(
    public status: PaymentSessionStatus,
    public session: ReturnType<typeof publicSession>,
  ) {
    super('Payment not completed')
  }
}

interface CompletionCtx {
  cart: CartRow
  view: CartView
  session: typeof t.paymentSession.$inferSelect
  collectionId: string
  provider: PaymentProvider
  reservations: { id: string; inventoryItemId: string; locationId: string; quantity: number; lineItemId: string }[]
  payment?: ProviderResult
  orderId?: string
  displayId?: number
}

function validate(view: CartView, cart: CartRow) {
  assertOpen(cart)
  const issues: { path: string; message: string }[] = []
  if (!view.items.length) issues.push({ path: 'items', message: 'Your cart is empty' })
  if (!view.email) issues.push({ path: 'email', message: 'Add your email' })
  const needsShipping = view.items.some((i) => i.requiresShipping)
  const a = view.shippingAddress
  if (needsShipping && (!a?.address1 || !a.city || !a.countryCode || !a.firstName)) issues.push({ path: 'shippingAddress', message: 'Add a shipping address' })
  const profiles = new Set(view.items.map((i) => i.shippingProfileId).filter(Boolean))
  const covered = new Set(view.shippingMethods.map((m) => m.shippingProfileId).filter(Boolean))
  for (const p of profiles) if (!covered.has(p)) issues.push({ path: 'shippingMethods', message: 'Choose a delivery method' })
  if (issues.length) throw apiError(400, 'cart_incomplete', issues[0]!.message, issues)
}

/** Payment status for the order, given what the provider reported. */
function orderPaymentStatus(providerId: string, status: PaymentSessionStatus): typeof t.PAYMENT_STATUSES[number] {
  if (providerId === 'manual') return 'awaiting'
  return status === 'captured' ? 'captured' : 'authorized'
}

export async function completeCart(deps: CheckoutDeps, cartId: string): Promise<{ orderId: string; displayId: number; created: boolean }> {
  const { db } = deps
  const cart = await loadCart(db, cartId)
  // Idempotent per cart: a completed cart returns its order.
  const [existing] = await db.select({ id: t.order.id, displayId: t.order.displayId }).from(t.order).where(eq(t.order.cartId, cartId))
  if (existing) return { orderId: existing.id, displayId: existing.displayId, created: false }

  const view = await getCartView(db, cartId)
  validate(view, cart)
  const active = await activeSession(db, cartId)
  if (!active) throw apiError(400, 'payment_required', 'Choose a payment method')
  if (active.session.amount !== view.totals.total || active.session.currencyCode !== view.currencyCode) {
    throw apiError(409, 'payment_session_stale', 'Your cart changed. Please confirm payment again.')
  }

  const ctx: CompletionCtx = { cart, view, session: active.session, collectionId: active.collection.id, provider: deps.provider(active.session.providerId), reservations: [] }
  try {
    await runWorkflow<CompletionCtx>(
      [
        {
          name: 'reserve-inventory',
          run: async (c) => {
            // Prefer the location the chosen shipping option ships from.
            const methods = await db.select({ data: t.cartShippingMethod.data }).from(t.cartShippingMethod).where(eq(t.cartShippingMethod.cartId, c.cart.id))
            const preferredLocation = (methods.find((m) => m.data?.locationId)?.data?.locationId as string | undefined) ?? null
            const variants = await db
              .select({ id: t.productVariant.id, manageInventory: t.productVariant.manageInventory, allowBackorder: t.productVariant.allowBackorder, itemId: t.inventoryItem.id })
              .from(t.productVariant)
              .leftJoin(t.inventoryItem, eq(t.inventoryItem.variantId, t.productVariant.id))
              .where(inArray(t.productVariant.id, c.view.items.map((i) => i.variantId)))
            for (const line of c.view.items) {
              const v = variants.find((x) => x.id === line.variantId)
              if (!v?.manageInventory || !v.itemId) continue
              const locationId = await reserveAnywhere(db, v.itemId, line.quantity, preferredLocation, v.allowBackorder)
              if (!locationId) throw apiError(409, 'insufficient_inventory', `${line.title} (${line.variantTitle}) just sold out`, { lineItemId: line.id })
              const [r] = await db
                .insert(t.reservation)
                .values({ inventoryItemId: v.itemId, locationId, quantity: line.quantity, cartId: c.cart.id, lineItemId: line.id, expiresAt: new Date(Date.now() + 15 * 60_000), description: 'Checkout' })
                .returning({ id: t.reservation.id })
              c.reservations.push({ id: r!.id, inventoryItemId: v.itemId, locationId, quantity: line.quantity, lineItemId: line.id })
            }
          },
          compensate: async (c) => {
            for (const r of c.reservations) {
              await releaseAt(db, r.inventoryItemId, r.locationId, r.quantity)
              await db.delete(t.reservation).where(eq(t.reservation.id, r.id))
            }
          },
        },
        {
          name: 'authorize-payment',
          run: async (c) => {
            const result = await c.provider.authorize(c.session.data)
            if (result.status !== 'authorized' && result.status !== 'captured') {
              await db.update(t.paymentSession).set({ status: result.status }).where(eq(t.paymentSession.id, c.session.id))
              throw new PaymentRequiredError(result.status, publicSession({ ...c.session, status: result.status }))
            }
            c.payment = result
          },
          compensate: async (c) => {
            if (!c.payment) return
            if (c.payment.status === 'captured' && c.session.providerId !== 'manual') await c.provider.refund({ ...c.session.data, ...c.payment.data }, c.session.amount)
            else await c.provider.cancel({ ...c.session.data, ...c.payment.data })
          },
        },
        {
          name: 'create-order',
          run: async (c) => {
            const created = await deps.withTx((tx) => createOrderFromCart(tx, c))
            c.orderId = created.id
            c.displayId = created.displayId
          },
        },
      ],
      ctx,
    )
  } catch (err) {
    if (err instanceof WorkflowError) {
      for (const ce of err.compensationErrors) console.error(`[checkout] compensation "${ce.step}" failed for cart ${cartId}`, ce.error instanceof Error ? ce.error.message : ce.error)
      // A concurrent request may have created the order first (unique cart_id): return it.
      const [raced] = await db.select({ id: t.order.id, displayId: t.order.displayId }).from(t.order).where(eq(t.order.cartId, cartId))
      if (raced) return { orderId: raced.id, displayId: raced.displayId, created: false }
      throw err.cause
    }
    throw err
  }
  await deps.emit('order.placed', { id: ctx.orderId!, displayId: ctx.displayId!, email: view.email, total: view.totals.total, currencyCode: view.currencyCode })
  return { orderId: ctx.orderId!, displayId: ctx.displayId!, created: true }
}

/** Everything that must happen atomically when an order is created. */
async function createOrderFromCart(tx: Tx, c: CompletionCtx): Promise<{ id: string; displayId: number }> {
  const { view, cart, session } = c
  const payment = c.payment!
  const paymentStatus = orderPaymentStatus(session.providerId, payment.status)
  const captured = paymentStatus === 'captured'

  // Guests get a customer record (has_account = false) so the admin can see their history.
  let customerId = cart.customerId
  if (!customerId) {
    const [guest] = await tx
      .select({ id: t.customer.id })
      .from(t.customer)
      .where(and(eq(t.customer.email, view.email!), isNull(t.customer.deletedAt)))
      .orderBy(desc(t.customer.hasAccount))
      .limit(1)
    customerId =
      guest?.id ??
      (await tx.insert(t.customer).values({ email: view.email!, firstName: view.shippingAddress?.firstName ?? null, lastName: view.shippingAddress?.lastName ?? null, phone: view.shippingAddress?.phone ?? null }).returning({ id: t.customer.id }))[0]!.id
  }

  const [order] = await tx
    .insert(t.order)
    .values({
      status: 'pending',
      paymentStatus,
      fulfillmentStatus: 'not_fulfilled',
      regionId: cart.regionId,
      salesChannelId: cart.salesChannelId,
      customerId,
      email: view.email!,
      currencyCode: view.currencyCode,
      cartId: cart.id,
      shippingAddress: view.shippingAddress,
      billingAddress: view.billingAddress ?? view.shippingAddress,
      isTaxInclusive: view.region.taxInclusive,
      itemSubtotal: view.totals.itemSubtotal,
      subtotal: view.totals.subtotal,
      discountTotal: view.totals.discountTotal,
      shippingTotal: view.totals.shippingTotal,
      taxTotal: view.totals.taxTotal,
      total: view.totals.total,
      paidTotal: captured ? view.totals.total : 0,
      promoCodes: view.promotions.map((p) => p.code),
    })
    .returning({ id: t.order.id, displayId: t.order.displayId })
  const orderId = order!.id

  const items = await tx
    .insert(t.orderItem)
    .values(
      view.items.map((i) => ({
        orderId,
        variantId: i.variantId,
        productId: i.productId,
        title: i.title,
        subtitle: i.subtitle,
        variantTitle: i.variantTitle,
        sku: i.sku,
        thumbnail: i.thumbnail,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
        discountTotal: i.discountTotal,
        taxTotal: i.taxTotal,
        total: i.total,
        taxRateBps: i.taxRateBps,
        isTaxInclusive: i.isTaxInclusive,
        requiresShipping: i.requiresShipping,
        isGiftcard: i.isGiftcard,
        metadata: { lineItemId: i.id },
      })),
    )
    .returning({ id: t.orderItem.id, metadata: t.orderItem.metadata })
  const itemIdForLine = new Map(items.map((i) => [String((i.metadata as { lineItemId: string }).lineItemId), i.id]))

  if (view.shippingMethods.length) {
    await tx.insert(t.orderShippingMethod).values(view.shippingMethods.map((m) => ({ orderId, shippingOptionId: m.shippingOptionId, name: m.name, amount: m.amount, discountTotal: m.discountTotal, taxTotal: m.taxTotal })))
  }

  // Reservations now belong to the order and no longer expire.
  for (const r of c.reservations) {
    await tx.update(t.reservation).set({ orderId, orderItemId: itemIdForLine.get(r.lineItemId) ?? null, expiresAt: null, description: `Order #${order!.displayId}` }).where(eq(t.reservation.id, r.id))
  }

  // Payment
  await tx.update(t.paymentSession).set({ status: payment.status, data: { ...session.data, ...payment.data }, authorizedAt: new Date() }).where(eq(t.paymentSession.id, session.id))
  await tx
    .update(t.paymentCollection)
    .set({ orderId, status: paymentStatus === 'awaiting' ? 'awaiting' : captured ? 'completed' : 'authorized', authorizedAmount: paymentStatus === 'awaiting' ? 0 : session.amount, capturedAmount: captured ? session.amount : 0 })
    .where(eq(t.paymentCollection.id, c.collectionId))
  const [pay] = await tx
    .insert(t.payment)
    .values({
      paymentCollectionId: c.collectionId,
      paymentSessionId: session.id,
      orderId,
      providerId: session.providerId,
      amount: session.amount,
      currencyCode: session.currencyCode,
      capturedAmount: captured ? session.amount : 0,
      providerReference: payment.reference ?? null,
      data: { ...session.data, ...payment.data },
      capturedAt: captured ? new Date() : null,
    })
    .returning({ id: t.payment.id })

  const transactions: (typeof t.orderTransaction.$inferInsert)[] = []
  const events: (typeof t.orderEvent.$inferInsert)[] = [{ orderId, type: 'order.placed', message: 'Order placed', tone: 'neutral', actorType: cart.customerId ? 'customer' : 'system', actorId: customerId }]
  if (paymentStatus !== 'awaiting') {
    transactions.push({ orderId, paymentId: pay!.id, kind: 'authorization', amount: session.amount, currencyCode: session.currencyCode, providerId: session.providerId, reference: payment.reference ?? null })
    events.push({ orderId, type: 'payment.authorized', message: `Payment authorized via ${session.providerId}`, tone: 'warn' })
  } else {
    events.push({ orderId, type: 'payment.awaiting', message: 'Cash on delivery: collect payment on delivery', tone: 'warn' })
  }
  if (captured) {
    transactions.push({ orderId, paymentId: pay!.id, kind: 'capture', amount: session.amount, currencyCode: session.currencyCode, providerId: session.providerId, reference: payment.reference ?? null })
    events.push({ orderId, type: 'payment.captured', message: 'Payment captured', tone: 'ok' })
  }
  if (view.promotions.length) events.push({ orderId, type: 'promotion.applied', message: `Discount ${view.promotions.map((p) => p.code).join(', ')} applied`, tone: 'neutral' })
  if (transactions.length) await tx.insert(t.orderTransaction).values(transactions)
  await tx.insert(t.orderEvent).values(events)

  // Promotion usage and campaign budgets
  for (const applied of view._promotionResult.applied) {
    const [promo] = await tx.update(t.promotion).set({ usageCount: sql`${t.promotion.usageCount} + 1` }).where(eq(t.promotion.id, applied.promotionId)).returning({ campaignId: t.promotion.campaignId })
    if (promo?.campaignId) {
      await tx
        .update(t.campaign)
        .set({ budgetUsed: sql`${t.campaign.budgetUsed} + case when ${t.campaign.budgetType} = 'spend' then ${applied.amount} when ${t.campaign.budgetType} = 'usage' then 1 else 0 end` })
        .where(eq(t.campaign.id, promo.campaignId))
    }
  }

  await tx.update(t.cart).set({ completedAt: new Date(), customerId }).where(eq(t.cart.id, cart.id))
  return { id: orderId, displayId: order!.displayId }
}

export async function getActiveSession(db: DbLike, cartId: string) {
  const s = await activeSession(db, cartId)
  if (!s) throw notFound('Payment session')
  return publicSession(s.session)
}
