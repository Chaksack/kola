/**
 * Draft orders: an admin builds an order for a customer (phone or showroom sales). It's priced and
 * taxed like a cart, stored as an order with is_draft = true, and converted when confirmed: stock is
 * reserved then, and payment is either recorded as paid or left awaiting.
 */
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { DbLike, Tx } from '../db/client'
import * as t from '../db/schema'
import type { AddressSnapshot } from '../db/schema'
import { taxRateFor } from './cart'
import { apiError, badRequest, conflict, notFound } from './errors'
import { reserveAnywhere } from './inventory'
import { calculatePrices } from './pricing'
import { computeTotals } from './totals'

export interface DraftInput {
  email: string
  regionId: string
  salesChannelId?: string | null
  items: { variantId: string; quantity: number; unitPrice?: number | null }[]
  shippingOptionId?: string | null
  shippingAmount?: number | null
  shippingAddress?: AddressSnapshot | null
  note?: string | null
}

export async function createDraftOrder(tx: Tx, input: DraftInput, actor: { id: string; name: string | null }) {
  const [region] = await tx.select().from(t.region).where(and(eq(t.region.id, input.regionId), isNull(t.region.deletedAt)))
  if (!region) throw badRequest('Unknown region')
  const [store] = await tx.select().from(t.store).limit(1)
  const salesChannelId = input.salesChannelId || store?.defaultSalesChannelId
  if (!salesChannelId) throw badRequest('Choose a sales channel')

  const variantIds = input.items.map((i) => i.variantId)
  const variants = await tx
    .select({ id: t.productVariant.id, title: t.productVariant.title, sku: t.productVariant.sku, productId: t.product.id, productTitle: t.product.title, thumbnail: t.product.thumbnail, typeId: t.product.typeId, isGiftcard: t.product.isGiftcard })
    .from(t.productVariant)
    .innerJoin(t.product, eq(t.product.id, t.productVariant.productId))
    .where(and(inArray(t.productVariant.id, variantIds), isNull(t.productVariant.deletedAt)))
  const prices = await calculatePrices(tx, variantIds, { regionId: region.id, currencyCode: region.currencyCode })
  const rates = region.automaticTaxes ? await tx.select().from(t.taxRate).where(and(eq(t.taxRate.regionId, region.id), isNull(t.taxRate.deletedAt))) : []

  const lines = input.items.map((i, idx) => {
    const v = variants.find((x) => x.id === i.variantId)
    if (!v) throw badRequest('Unknown variant')
    const unitPrice = i.unitPrice ?? prices.get(i.variantId)?.amount
    if (unitPrice == null) throw apiError(422, 'variant_not_priced', `${v.productTitle} has no ${region.currencyCode} price; enter one`)
    return { key: String(idx), v, quantity: i.quantity, unitPrice, taxRateBps: taxRateFor(rates, v.typeId) }
  })

  let shipping: { name: string; amount: number; optionId: string | null } | null = null
  if (input.shippingOptionId) {
    const [opt] = await tx.select().from(t.shippingOption).where(eq(t.shippingOption.id, input.shippingOptionId))
    if (!opt) throw badRequest('Unknown shipping option')
    const optPrices = await tx.select().from(t.shippingOptionPrice).where(and(eq(t.shippingOptionPrice.shippingOptionId, opt.id), eq(t.shippingOptionPrice.currencyCode, region.currencyCode)))
    const price = input.shippingAmount ?? optPrices.find((p) => p.regionId === region.id)?.amount ?? optPrices.find((p) => !p.regionId)?.amount
    if (price == null) throw badRequest(`This shipping option has no ${region.currencyCode} price`)
    shipping = { name: opt.name, amount: price, optionId: opt.id }
  }
  const shippingRate = taxRateFor(rates, null)
  const totals = computeTotals({
    items: lines.map((l) => ({ id: l.key, unitPrice: l.unitPrice, quantity: l.quantity, taxRateBps: l.taxRateBps, isTaxInclusive: region.taxInclusive })),
    shippingMethods: shipping ? [{ id: 'ship', amount: shipping.amount, taxRateBps: shippingRate, isTaxInclusive: region.taxInclusive }] : [],
  })

  const email = input.email.toLowerCase()
  const [existing] = await tx.select({ id: t.customer.id }).from(t.customer).where(and(eq(t.customer.email, email), isNull(t.customer.deletedAt))).orderBy(desc(t.customer.hasAccount)).limit(1)
  const customerId = existing?.id ?? (await tx.insert(t.customer).values({ email, firstName: input.shippingAddress?.firstName ?? null, lastName: input.shippingAddress?.lastName ?? null }).returning({ id: t.customer.id }))[0]!.id

  const [order] = await tx
    .insert(t.order)
    .values({
      isDraft: true,
      regionId: region.id,
      salesChannelId,
      customerId,
      email,
      currencyCode: region.currencyCode,
      shippingAddress: input.shippingAddress ?? null,
      billingAddress: input.shippingAddress ?? null,
      isTaxInclusive: region.taxInclusive,
      itemSubtotal: totals.itemSubtotal,
      subtotal: totals.subtotal,
      shippingTotal: totals.shippingTotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
    })
    .returning({ id: t.order.id, displayId: t.order.displayId })
  await tx.insert(t.orderItem).values(
    lines.map((l, idx) => {
      const lt = totals.items[idx]!
      return { orderId: order!.id, variantId: l.v.id, productId: l.v.productId, title: l.v.productTitle, variantTitle: l.v.title, sku: l.v.sku, thumbnail: l.v.thumbnail, quantity: l.quantity, unitPrice: l.unitPrice, subtotal: lt.subtotal, taxTotal: lt.taxTotal, total: lt.total, taxRateBps: l.taxRateBps, isTaxInclusive: region.taxInclusive, isGiftcard: l.v.isGiftcard, requiresShipping: !l.v.isGiftcard }
    }),
  )
  if (shipping) await tx.insert(t.orderShippingMethod).values({ orderId: order!.id, shippingOptionId: shipping.optionId, name: shipping.name, amount: shipping.amount, taxTotal: totals.shippingTaxTotal })
  await tx.insert(t.orderEvent).values({ orderId: order!.id, type: 'draft.created', message: input.note ? `Draft created: ${input.note}` : 'Draft order created', actorType: 'user', actorId: actor.id, actorName: actor.name })
  return order!
}

/** Turn a draft into a real order: reserve stock and record payment (paid) or leave it awaiting. */
export async function convertDraftOrder(tx: Tx, orderId: string, paid: boolean, actor: { id: string; name: string | null }) {
  const [order] = await tx.select().from(t.order).where(and(eq(t.order.id, orderId), isNull(t.order.deletedAt)))
  if (!order) throw notFound('Draft order')
  if (!order.isDraft) throw conflict('This order has already been placed')
  const items = await tx.select().from(t.orderItem).where(eq(t.orderItem.orderId, orderId))
  const [store] = await tx.select({ locationId: t.store.defaultLocationId }).from(t.store).limit(1)
  for (const item of items) {
    if (!item.variantId) continue
    const [inv] = await tx
      .select({ id: t.inventoryItem.id, manage: t.productVariant.manageInventory, backorder: t.productVariant.allowBackorder })
      .from(t.inventoryItem)
      .innerJoin(t.productVariant, eq(t.productVariant.id, t.inventoryItem.variantId))
      .where(eq(t.inventoryItem.variantId, item.variantId))
    if (!inv?.manage) continue
    const locationId = await reserveAnywhere(tx, inv.id, item.quantity, store?.locationId, inv.backorder)
    if (!locationId) throw apiError(409, 'insufficient_inventory', `${item.title} (${item.variantTitle ?? ''}) is out of stock`)
    await tx.insert(t.reservation).values({ inventoryItemId: inv.id, locationId, quantity: item.quantity, orderId, orderItemId: item.id, description: `Order #${order.displayId}` })
  }
  const [col] = await tx.insert(t.paymentCollection).values({ orderId, currencyCode: order.currencyCode, amount: order.total, capturedAmount: paid ? order.total : 0, status: paid ? 'completed' : 'awaiting' }).returning()
  const [pay] = await tx
    .insert(t.payment)
    .values({ paymentCollectionId: col!.id, orderId, providerId: 'manual', amount: order.total, currencyCode: order.currencyCode, capturedAmount: paid ? order.total : 0, capturedAt: paid ? new Date() : null })
    .returning({ id: t.payment.id })
  if (paid) await tx.insert(t.orderTransaction).values({ orderId, paymentId: pay!.id, kind: 'capture', amount: order.total, currencyCode: order.currencyCode, providerId: 'manual', note: 'Draft marked as paid' })
  await tx
    .update(t.order)
    .set({ isDraft: false, paymentStatus: paid ? 'captured' : 'awaiting', paidTotal: paid ? order.total : 0, createdAt: new Date() })
    .where(eq(t.order.id, orderId))
  await tx.insert(t.orderEvent).values({ orderId, type: 'order.placed', message: paid ? 'Draft converted and marked as paid' : 'Draft converted · payment awaiting', tone: paid ? 'ok' : 'warn', actorType: 'user', actorId: actor.id, actorName: actor.name })
  return { id: orderId, displayId: order.displayId, email: order.email, total: order.total, currencyCode: order.currencyCode }
}

export async function listDraftOrders(db: DbLike) {
  const rows = await db
    .select({ id: t.order.id, displayId: t.order.displayId, email: t.order.email, total: t.order.total, currencyCode: t.order.currencyCode, createdAt: t.order.createdAt, firstName: t.customer.firstName, lastName: t.customer.lastName })
    .from(t.order)
    .leftJoin(t.customer, eq(t.customer.id, t.order.customerId))
    .where(and(eq(t.order.isDraft, true), isNull(t.order.deletedAt)))
    .orderBy(desc(t.order.createdAt))
  const ids = rows.map((r) => r.id)
  const items = ids.length ? await db.select({ orderId: t.orderItem.orderId, title: t.orderItem.title, quantity: t.orderItem.quantity }).from(t.orderItem).where(inArray(t.orderItem.orderId, ids)) : []
  return rows.map((r) => ({ ...r, items: items.filter((i) => i.orderId === r.id).map(({ title, quantity }) => ({ title, quantity })) }))
}
