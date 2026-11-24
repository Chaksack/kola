/**
 * Cart service: line items with price snapshots, stock checks, promotions and a computed view with
 * tax and totals. Framework-agnostic; the API layer handles auth and channel scoping.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import * as t from '../db/schema'
import { calculatePrices } from './pricing'
import { applyPromotions, REJECT_MESSAGES, type PromoLine, type PromotionDef } from './promotion'
import { computeTotals } from './totals'
import { apiError, badRequest, notFound } from './errors'

export const CART_TTL_DAYS = 14

export type CartRow = typeof t.cart.$inferSelect
export type RegionRow = typeof t.region.$inferSelect

export async function loadCart(db: DbLike, id: string): Promise<CartRow> {
  const [cart] = await db.select().from(t.cart).where(and(eq(t.cart.id, id), isNull(t.cart.deletedAt)))
  if (!cart) throw notFound('Cart')
  return cart
}

export function assertOpen(cart: CartRow) {
  if (cart.completedAt) throw apiError(409, 'cart_completed', 'This cart has already been checked out')
}

export async function customerGroupIds(db: DbLike, customerId: string | null): Promise<string[]> {
  if (!customerId) return []
  const rows = await db.select({ id: t.customerGroupMember.groupId }).from(t.customerGroupMember).where(eq(t.customerGroupMember.customerId, customerId))
  return rows.map((r) => r.id)
}

async function regionFor(db: DbLike, regionId: string): Promise<RegionRow> {
  const [region] = await db.select().from(t.region).where(and(eq(t.region.id, regionId), isNull(t.region.deletedAt)))
  if (!region) throw notFound('Region')
  return region
}

/** Total available across locations, or null when stock isn't tracked / backorders are allowed. */
async function availableFor(db: DbLike, variant: { id: string; manageInventory: boolean; allowBackorder: boolean }): Promise<number | null> {
  if (!variant.manageInventory || variant.allowBackorder) return null
  const [row] = await db
    .select({ available: sql<number>`coalesce(sum(${t.inventoryLevel.stocked} - ${t.inventoryLevel.reserved}), 0)::int` })
    .from(t.inventoryItem)
    .leftJoin(t.inventoryLevel, eq(t.inventoryLevel.inventoryItemId, t.inventoryItem.id))
    .where(eq(t.inventoryItem.variantId, variant.id))
  return Math.max(0, row?.available ?? 0)
}

export async function addLineItem(db: DbLike, cart: CartRow, variantId: string, quantity: number) {
  assertOpen(cart)
  const [v] = await db
    .select({
      id: t.productVariant.id,
      title: t.productVariant.title,
      sku: t.productVariant.sku,
      manageInventory: t.productVariant.manageInventory,
      allowBackorder: t.productVariant.allowBackorder,
      productId: t.product.id,
      productTitle: t.product.title,
      productSubtitle: t.product.subtitle,
      handle: t.product.handle,
      thumbnail: t.product.thumbnail,
      collectionId: t.product.collectionId,
      typeId: t.product.typeId,
      status: t.product.status,
      isGiftcard: t.product.isGiftcard,
      discountable: t.product.discountable,
    })
    .from(t.productVariant)
    .innerJoin(t.product, eq(t.product.id, t.productVariant.productId))
    .where(and(eq(t.productVariant.id, variantId), isNull(t.productVariant.deletedAt), isNull(t.product.deletedAt)))
  if (!v || v.status !== 'published') throw notFound('Product variant')
  const [inChannel] = await db
    .select({ x: t.productSalesChannel.productId })
    .from(t.productSalesChannel)
    .where(and(eq(t.productSalesChannel.productId, v.productId), eq(t.productSalesChannel.salesChannelId, cart.salesChannelId)))
  if (!inChannel) throw notFound('Product variant')

  const [existing] = await db.select().from(t.cartLineItem).where(and(eq(t.cartLineItem.cartId, cart.id), eq(t.cartLineItem.variantId, variantId)))
  const nextQty = (existing?.quantity ?? 0) + quantity
  const available = await availableFor(db, v)
  if (available !== null && nextQty > available) {
    throw apiError(409, 'insufficient_inventory', available > 0 ? `Only ${available} left in stock` : 'This item is out of stock', { available })
  }
  const region = await regionFor(db, cart.regionId)
  const groups = await customerGroupIds(db, cart.customerId)
  const price = (await calculatePrices(db, [variantId], { regionId: region.id, currencyCode: cart.currencyCode, quantity: nextQty, customerGroupIds: groups })).get(variantId)
  if (!price) throw apiError(422, 'variant_not_priced', `This item isn't available in ${cart.currencyCode}`)

  const snapshot = {
    title: v.productTitle,
    subtitle: v.productSubtitle,
    variantTitle: v.title,
    thumbnail: v.thumbnail,
    sku: v.sku,
    productHandle: v.handle,
    collectionId: v.collectionId,
    productTypeId: v.typeId,
    unitPrice: price.amount,
    compareAtUnitPrice: price.originalAmount > price.amount ? price.originalAmount : null,
    isTaxInclusive: region.taxInclusive,
    isDiscountable: v.discountable && !v.isGiftcard,
    isGiftcard: v.isGiftcard,
    requiresShipping: !v.isGiftcard,
  }
  if (existing) {
    await db.update(t.cartLineItem).set({ ...snapshot, quantity: nextQty }).where(eq(t.cartLineItem.id, existing.id))
  } else {
    await db.insert(t.cartLineItem).values({ ...snapshot, cartId: cart.id, variantId, productId: v.productId, quantity })
  }
  await touch(db, cart.id)
}

export async function updateLineItem(db: DbLike, cart: CartRow, lineId: string, quantity: number) {
  assertOpen(cart)
  const [line] = await db.select().from(t.cartLineItem).where(and(eq(t.cartLineItem.id, lineId), eq(t.cartLineItem.cartId, cart.id)))
  if (!line) throw notFound('Line item')
  if (quantity === 0) {
    await db.delete(t.cartLineItem).where(eq(t.cartLineItem.id, lineId))
  } else {
    const [v] = await db.select({ id: t.productVariant.id, manageInventory: t.productVariant.manageInventory, allowBackorder: t.productVariant.allowBackorder }).from(t.productVariant).where(eq(t.productVariant.id, line.variantId))
    if (v) {
      const available = await availableFor(db, v)
      if (available !== null && quantity > available) throw apiError(409, 'insufficient_inventory', available > 0 ? `Only ${available} left in stock` : 'This item is out of stock', { available })
    }
    await db.update(t.cartLineItem).set({ quantity }).where(eq(t.cartLineItem.id, lineId))
  }
  await repriceCart(db, cart)
}

/**
 * Re-price every line for the cart's current region, currency and customer. Lines with no price in
 * the new currency are removed (returned so the UI can say why).
 */
export async function repriceCart(db: DbLike, cart: CartRow): Promise<string[]> {
  const lines = await db.select().from(t.cartLineItem).where(eq(t.cartLineItem.cartId, cart.id))
  if (!lines.length) return []
  const region = await regionFor(db, cart.regionId)
  const groups = await customerGroupIds(db, cart.customerId)
  const removed: string[] = []
  for (const l of lines) {
    const price = (await calculatePrices(db, [l.variantId], { regionId: region.id, currencyCode: cart.currencyCode, quantity: l.quantity, customerGroupIds: groups })).get(l.variantId)
    if (!price) {
      await db.delete(t.cartLineItem).where(eq(t.cartLineItem.id, l.id))
      removed.push(l.title)
      continue
    }
    await db
      .update(t.cartLineItem)
      .set({ unitPrice: price.amount, compareAtUnitPrice: price.originalAmount > price.amount ? price.originalAmount : null, isTaxInclusive: region.taxInclusive })
      .where(eq(t.cartLineItem.id, l.id))
  }
  await touch(db, cart.id)
  return removed
}

async function touch(db: DbLike, cartId: string) {
  await db.update(t.cart).set({ expiresAt: new Date(Date.now() + CART_TTL_DAYS * 86_400_000) }).where(eq(t.cart.id, cartId))
}

// ── Promotions ──────────────────────────────────────────────────────────

export async function loadPromotionDefs(db: DbLike, where: { codes?: string[]; automatic?: boolean }): Promise<PromotionDef[]> {
  const conds = []
  if (where.codes?.length) conds.push(inArray(sql`upper(${t.promotion.code})`, where.codes.map((c) => c.toUpperCase())))
  if (where.automatic) conds.push(and(eq(t.promotion.isAutomatic, true), eq(t.promotion.status, 'active')))
  if (!conds.length) return []
  const rows = await db
    .select({ p: t.promotion, c: t.campaign })
    .from(t.promotion)
    .leftJoin(t.campaign, eq(t.campaign.id, t.promotion.campaignId))
    .where(and(isNull(t.promotion.deletedAt), conds.length === 1 ? conds[0] : sql`(${conds[0]}) or (${conds[1]})`))
  if (!rows.length) return []
  const rules = await db.select().from(t.promotionRule).where(inArray(t.promotionRule.promotionId, rows.map((r) => r.p.id)))
  return rows.map(({ p, c }) => ({
    ...p,
    rules: rules.filter((r) => r.promotionId === p.id && !r.deletedAt).map(({ ruleType, attribute, operator, values }) => ({ ruleType, attribute, operator, values })),
    campaign: c ? { startsAt: c.startsAt, endsAt: c.endsAt, budgetType: c.budgetType, budgetLimit: c.budgetLimit, budgetUsed: c.budgetUsed, budgetCurrencyCode: c.budgetCurrencyCode } : null,
  }))
}

export async function addPromotionCode(db: DbLike, cart: CartRow, code: string) {
  assertOpen(cart)
  const [def] = await loadPromotionDefs(db, { codes: [code] })
  if (!def || def.isAutomatic) throw apiError(400, 'invalid_promotion', "We don't recognise that code")
  await db.insert(t.cartPromotion).values({ cartId: cart.id, promotionId: def.id, code: def.code }).onConflictDoNothing()
  const view = await getCartView(db, cart.id)
  const rejected = view.rejectedPromotions.find((r) => r.promotionId === def.id)
  if (rejected) {
    await db.delete(t.cartPromotion).where(and(eq(t.cartPromotion.cartId, cart.id), eq(t.cartPromotion.promotionId, def.id)))
    throw apiError(400, 'promotion_not_applicable', rejected.message, { reason: rejected.reason })
  }
  return view
}

export async function removePromotionCode(db: DbLike, cart: CartRow, code: string) {
  assertOpen(cart)
  await db.delete(t.cartPromotion).where(and(eq(t.cartPromotion.cartId, cart.id), sql`upper(${t.cartPromotion.code}) = ${code.toUpperCase()}`))
}

// ── View ────────────────────────────────────────────────────────────────

/** Tax rate for a line: product-type override if one exists, else the region default. */
export function taxRateFor(rates: { rateBps: number; isDefault: boolean; productTypeId: string | null }[], productTypeId: string | null): number {
  const override = productTypeId ? rates.find((r) => r.productTypeId === productTypeId) : undefined
  return (override ?? rates.find((r) => r.isDefault && !r.productTypeId) ?? rates.find((r) => !r.productTypeId))?.rateBps ?? 0
}

export async function getCartView(db: DbLike, id: string) {
  const cart = await loadCart(db, id)
  const [region, items, shippingMethods, promoLinks, rates] = await Promise.all([
    regionFor(db, cart.regionId),
    db.select().from(t.cartLineItem).where(eq(t.cartLineItem.cartId, id)).orderBy(asc(t.cartLineItem.createdAt)),
    db.select().from(t.cartShippingMethod).where(eq(t.cartShippingMethod.cartId, id)),
    db.select().from(t.cartPromotion).where(eq(t.cartPromotion.cartId, id)),
    db.select().from(t.taxRate).where(and(eq(t.taxRate.regionId, cart.regionId), isNull(t.taxRate.deletedAt))),
  ])
  const taxEnabled = region.automaticTaxes
  const categories = items.length
    ? await db.select().from(t.productCategoryProduct).where(inArray(t.productCategoryProduct.productId, [...new Set(items.map((i) => i.productId))]))
    : []
  const defs = [
    ...(await loadPromotionDefs(db, { automatic: true })),
    ...(promoLinks.length ? await loadPromotionDefs(db, { codes: promoLinks.map((p) => p.code ?? '').filter(Boolean) }) : []),
  ]
  // Keep codes in the order they were added (automatic promotions are ordered first by the engine).
  const groups = await customerGroupIds(db, cart.customerId)
  const promoLines: PromoLine[] = items.map((i) => ({
    id: i.id,
    productId: i.productId,
    variantId: i.variantId,
    collectionId: i.collectionId,
    categoryIds: categories.filter((c) => c.productId === i.productId).map((c) => c.categoryId),
    productTypeId: i.productTypeId,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    isDiscountable: i.isDiscountable,
  }))
  const promo = applyPromotions(defs, promoLines, {
    regionId: region.id,
    currencyCode: cart.currencyCode,
    customerGroupIds: groups,
    shippingMethods: shippingMethods.map((s) => ({ id: s.id, amount: s.amount })),
    now: new Date(),
  })
  const shippingRate = taxEnabled ? taxRateFor(rates, null) : 0
  const itemRates = items.map((i) => (taxEnabled ? taxRateFor(rates, i.productTypeId) : 0))
  const profiles = items.length
    ? await db.select({ id: t.product.id, profileId: t.product.shippingProfileId }).from(t.product).where(inArray(t.product.id, [...new Set(items.map((i) => i.productId))]))
    : []
  const totals = computeTotals({
    items: items.map((i, idx) => ({ id: i.id, unitPrice: i.unitPrice, quantity: i.quantity, taxRateBps: itemRates[idx]!, isTaxInclusive: region.taxInclusive, discount: promo.itemDiscounts[i.id] ?? 0 })),
    shippingMethods: shippingMethods.map((s) => ({ id: s.id, amount: s.amount, taxRateBps: shippingRate, isTaxInclusive: region.taxInclusive, discount: promo.shippingDiscounts[s.id] ?? 0 })),
  })

  return {
    id: cart.id,
    regionId: cart.regionId,
    salesChannelId: cart.salesChannelId,
    customerId: cart.customerId,
    email: cart.email,
    currencyCode: cart.currencyCode,
    shippingAddress: cart.shippingAddress,
    billingAddress: cart.billingAddress,
    completedAt: cart.completedAt,
    region: { id: region.id, name: region.name, currencyCode: region.currencyCode, taxInclusive: region.taxInclusive },
    items: items.map((i, idx) => ({
      ...totals.items[idx]!,
      id: i.id,
      variantId: i.variantId,
      productId: i.productId,
      title: i.title,
      subtitle: i.subtitle,
      variantTitle: i.variantTitle,
      thumbnail: i.thumbnail,
      sku: i.sku,
      productHandle: i.productHandle,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      compareAtUnitPrice: i.compareAtUnitPrice,
      isGiftcard: i.isGiftcard,
      requiresShipping: i.requiresShipping,
      collectionId: i.collectionId,
      productTypeId: i.productTypeId,
      shippingProfileId: profiles.find((p) => p.id === i.productId)?.profileId ?? null,
      taxRateBps: itemRates[idx]!,
      isTaxInclusive: region.taxInclusive,
    })),
    shippingMethods: shippingMethods.map((s, idx) => ({ ...totals.shippingMethods[idx]!, id: s.id, shippingOptionId: s.shippingOptionId, name: s.name, amount: s.amount, taxRateBps: shippingRate, shippingProfileId: (s.data?.shippingProfileId as string | undefined) ?? null })),
    promotions: promo.applied.map((a) => ({ promotionId: a.promotionId, code: a.code, amount: a.amount, isAutomatic: defs.find((d) => d.id === a.promotionId)?.isAutomatic ?? false })),
    rejectedPromotions: promo.rejected
      .filter((r) => promoLinks.some((l) => l.promotionId === r.promotionId))
      .map((r) => ({ ...r, message: REJECT_MESSAGES[r.reason] })),
    totals: {
      itemSubtotal: totals.itemSubtotal,
      shippingSubtotal: totals.shippingSubtotal,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      shippingTotal: totals.shippingTotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      itemCount: items.reduce((a, i) => a + i.quantity, 0),
    },
    /** Internal: for completion. */
    _promotionResult: promo,
  }
}
export type CartView = Awaited<ReturnType<typeof getCartView>>

export function publicCart(view: CartView) {
  const { _promotionResult: _p, ...rest } = view
  return rest
}

export function validateQuantity(q: number) {
  if (!Number.isInteger(q) || q < 0 || q > 999) throw badRequest('Quantity must be between 0 and 999')
}
