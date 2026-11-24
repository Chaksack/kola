import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm'
import type { DbLike, Tx } from '../db/client'
import * as t from '../db/schema'
import { conflict, notFound } from './errors'

export interface PromotionInput {
  code: string
  type: 'standard' | 'buyget'
  isAutomatic: boolean
  status: 'draft' | 'active' | 'inactive'
  campaignId?: string | null
  applicationType: 'percentage' | 'fixed'
  value: number
  currencyCode?: string | null
  targetType: 'items' | 'shipping' | 'order'
  allocation: 'each' | 'across'
  maxQuantity?: number | null
  buyQuantity?: number | null
  applyToQuantity?: number | null
  stackable: boolean
  usageLimit?: number | null
  startsAt?: Date | null
  endsAt?: Date | null
  rules: { ruleType: 'condition' | 'target' | 'buy'; attribute: (typeof t.PROMOTION_RULE_ATTRIBUTES)[number]; operator: 'in' | 'eq' | 'gte' | 'lte'; values: string[] }[]
}

export async function listPromotions(db: DbLike, q: { limit: number; offset: number; q?: string; status?: string }) {
  const f: (SQL | undefined)[] = [isNull(t.promotion.deletedAt)]
  if (q.q) f.push(ilike(t.promotion.code, `%${q.q}%`))
  if (q.status) f.push(eq(t.promotion.status, q.status as 'draft'))
  const where = and(...f)
  const [rows, [total]] = await Promise.all([
    db
      .select({ p: t.promotion, campaignName: t.campaign.name })
      .from(t.promotion)
      .leftJoin(t.campaign, eq(t.campaign.id, t.promotion.campaignId))
      .where(where)
      .orderBy(desc(t.promotion.createdAt))
      .limit(q.limit)
      .offset(q.offset),
    db.select({ value: count() }).from(t.promotion).where(where),
  ])
  return { data: rows.map(({ p, campaignName }) => ({ ...p, campaignName })), count: total?.value ?? 0 }
}

export async function getPromotion(db: DbLike, id: string) {
  const [p] = await db.select().from(t.promotion).where(and(eq(t.promotion.id, id), isNull(t.promotion.deletedAt)))
  if (!p) throw notFound('Promotion')
  const rules = await db.select().from(t.promotionRule).where(and(eq(t.promotionRule.promotionId, id), isNull(t.promotionRule.deletedAt))).orderBy(asc(t.promotionRule.createdAt))
  const [usage] = await db.select({ orders: sql<number>`count(*)::int`, discount: sql<number>`coalesce(sum(${t.order.discountTotal}), 0)::int` }).from(t.order).where(sql`${t.order.promoCodes} @> ${JSON.stringify([p.code])}::jsonb`)
  return { ...p, rules: rules.map(({ ruleType, attribute, operator, values }) => ({ ruleType, attribute, operator, values })), usage: usage ?? { orders: 0, discount: 0 } }
}

export async function savePromotion(tx: Tx, input: PromotionInput, id?: string): Promise<string> {
  const [clash] = await tx.select({ id: t.promotion.id }).from(t.promotion).where(and(eq(sql`upper(${t.promotion.code})`, input.code), isNull(t.promotion.deletedAt), id ? ne(t.promotion.id, id) : undefined))
  if (clash) throw conflict(`The code ${input.code} is already in use`, [{ path: 'code', message: 'Code is taken' }])
  const { rules, ...fields } = input
  const values = { ...fields, campaignId: fields.campaignId || null, currencyCode: fields.applicationType === 'fixed' ? fields.currencyCode : null }
  let pid = id
  if (pid) {
    const [row] = await tx.update(t.promotion).set(values).where(and(eq(t.promotion.id, pid), isNull(t.promotion.deletedAt))).returning({ id: t.promotion.id })
    if (!row) throw notFound('Promotion')
  } else {
    pid = (await tx.insert(t.promotion).values(values).returning({ id: t.promotion.id }))[0]!.id
  }
  await tx.delete(t.promotionRule).where(eq(t.promotionRule.promotionId, pid))
  if (rules.length) await tx.insert(t.promotionRule).values(rules.map((r) => ({ ...r, promotionId: pid! })))
  return pid
}

export async function deletePromotion(db: DbLike, id: string) {
  // Free the code but keep the row: orders reference it by code.
  const [row] = await db.update(t.promotion).set({ deletedAt: new Date(), status: 'inactive', code: sql`${t.promotion.code} || '-DELETED-' || ${t.promotion.id}` }).where(and(eq(t.promotion.id, id), isNull(t.promotion.deletedAt))).returning({ id: t.promotion.id })
  if (!row) throw notFound('Promotion')
}

export async function listPriceLists(db: DbLike) {
  const rows = await db.select().from(t.priceList).where(isNull(t.priceList.deletedAt)).orderBy(desc(t.priceList.createdAt))
  const ids = rows.map((r) => r.id)
  const [counts, groups] = ids.length
    ? await Promise.all([
        db.select({ id: t.price.priceListId, n: sql<number>`count(distinct ${t.price.priceSetId})::int` }).from(t.price).where(and(inArray(t.price.priceListId, ids), isNull(t.price.deletedAt))).groupBy(t.price.priceListId),
        db.select({ listId: t.priceListCustomerGroup.priceListId, id: t.customerGroup.id, name: t.customerGroup.name }).from(t.priceListCustomerGroup).innerJoin(t.customerGroup, eq(t.customerGroup.id, t.priceListCustomerGroup.customerGroupId)).where(inArray(t.priceListCustomerGroup.priceListId, ids)),
      ])
    : [[], []]
  const now = new Date()
  return rows.map((r) => ({
    ...r,
    variantCount: counts.find((c) => c.id === r.id)?.n ?? 0,
    customerGroups: groups.filter((g) => g.listId === r.id).map(({ id, name }) => ({ id, name })),
    effectiveStatus: r.status !== 'active' ? 'draft' : r.startsAt && r.startsAt > now ? 'scheduled' : r.endsAt && r.endsAt < now ? 'expired' : 'active',
  }))
}

export async function getPriceList(db: DbLike, id: string) {
  const [list] = await db.select().from(t.priceList).where(and(eq(t.priceList.id, id), isNull(t.priceList.deletedAt)))
  if (!list) throw notFound('Price list')
  const [prices, groups] = await Promise.all([
    db
      .select({ id: t.price.id, amount: t.price.amount, currencyCode: t.price.currencyCode, regionId: t.price.regionId, variantId: t.productVariant.id, variantTitle: t.productVariant.title, sku: t.productVariant.sku, productTitle: t.product.title, productId: t.product.id })
      .from(t.price)
      .innerJoin(t.priceSet, eq(t.priceSet.id, t.price.priceSetId))
      .innerJoin(t.productVariant, eq(t.productVariant.id, t.priceSet.variantId))
      .innerJoin(t.product, eq(t.product.id, t.productVariant.productId))
      .where(and(eq(t.price.priceListId, id), isNull(t.price.deletedAt)))
      .orderBy(asc(t.product.title), asc(t.productVariant.rank)),
    db.select({ id: t.priceListCustomerGroup.customerGroupId }).from(t.priceListCustomerGroup).where(eq(t.priceListCustomerGroup.priceListId, id)),
  ])
  // Base prices for comparison
  const variantIds = [...new Set(prices.map((p) => p.variantId))]
  const base = variantIds.length
    ? await db.select({ variantId: t.priceSet.variantId, amount: t.price.amount, currencyCode: t.price.currencyCode }).from(t.price).innerJoin(t.priceSet, eq(t.priceSet.id, t.price.priceSetId)).where(and(inArray(t.priceSet.variantId, variantIds), isNull(t.price.priceListId), isNull(t.price.regionId), isNull(t.price.deletedAt)))
    : []
  return { ...list, customerGroupIds: groups.map((g) => g.id), prices: prices.map((p) => ({ ...p, baseAmount: base.find((b) => b.variantId === p.variantId && b.currencyCode === p.currencyCode)?.amount ?? null })) }
}

export async function setPriceListPrices(tx: Tx, listId: string, prices: { variantId: string; currencyCode: string; amount: number; regionId?: string | null }[], replaceVariants: boolean) {
  const variantIds = [...new Set(prices.map((p) => p.variantId))]
  for (const variantId of variantIds) {
    const [set] = await tx.insert(t.priceSet).values({ variantId }).onConflictDoUpdate({ target: t.priceSet.variantId, set: { updatedAt: new Date() } }).returning({ id: t.priceSet.id })
    const mine = prices.filter((p) => p.variantId === variantId)
    if (replaceVariants) await tx.delete(t.price).where(and(eq(t.price.priceSetId, set!.id), eq(t.price.priceListId, listId)))
    else for (const p of mine) await tx.delete(t.price).where(and(eq(t.price.priceSetId, set!.id), eq(t.price.priceListId, listId), eq(t.price.currencyCode, p.currencyCode)))
    if (mine.length) await tx.insert(t.price).values(mine.map((p) => ({ priceSetId: set!.id, priceListId: listId, amount: p.amount, currencyCode: p.currencyCode, regionId: p.regionId || null })))
  }
}
