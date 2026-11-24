/**
 * Price calculation. Picks the price a customer pays for each variant in a region:
 *  1. Base prices in the region's currency; a region-specific price beats a currency-wide one, and
 *     quantity tiers (min/max quantity) must match.
 *  2. Active price lists whose dates and customer-group rules match. An `override` list replaces the
 *     base price; a `sale` list applies only when it's cheaper. The lowest candidate wins.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import * as t from '../db/schema'

export interface PriceCandidate {
  amount: number
  currencyCode: string
  regionId: string | null
  minQuantity: number | null
  maxQuantity: number | null
  priceList: { id: string; type: 'sale' | 'override'; status: 'draft' | 'active'; startsAt: Date | null; endsAt: Date | null; customerGroupIds: string[] } | null
}

export interface PriceContext {
  regionId: string
  currencyCode: string
  quantity?: number
  customerGroupIds?: string[]
  now?: Date
}

export interface CalculatedPrice {
  /** What the customer pays per unit. */
  amount: number
  /** The base price before any price list, for strike-through display. */
  originalAmount: number
  currencyCode: string
  priceListId: string | null
  priceListType: 'sale' | 'override' | null
}

function quantityMatches(c: PriceCandidate, qty: number) {
  return (c.minQuantity === null || qty >= c.minQuantity) && (c.maxQuantity === null || qty <= c.maxQuantity)
}

/** Most specific first: region-specific, then the tier with the highest minimum quantity. */
function bySpecificity(a: PriceCandidate, b: PriceCandidate) {
  return Number(b.regionId !== null) - Number(a.regionId !== null) || (b.minQuantity ?? 0) - (a.minQuantity ?? 0)
}

export function pickPrice(candidates: PriceCandidate[], ctx: PriceContext): CalculatedPrice | null {
  const qty = ctx.quantity ?? 1
  const now = ctx.now ?? new Date()
  const groups = ctx.customerGroupIds ?? []
  const applies = (c: PriceCandidate) =>
    c.currencyCode === ctx.currencyCode && (c.regionId === null || c.regionId === ctx.regionId) && quantityMatches(c, qty)

  const base = candidates.filter((c) => !c.priceList && applies(c)).sort(bySpecificity)[0]
  const listPrices = candidates
    .filter((c) => {
      const pl = c.priceList
      if (!pl || !applies(c) || pl.status !== 'active') return false
      if (pl.startsAt && pl.startsAt > now) return false
      if (pl.endsAt && pl.endsAt < now) return false
      return pl.customerGroupIds.length === 0 || pl.customerGroupIds.some((g) => groups.includes(g))
    })
    .sort(bySpecificity)

  const override = listPrices.filter((c) => c.priceList!.type === 'override').sort((a, b) => a.amount - b.amount)[0]
  const sale = listPrices.filter((c) => c.priceList!.type === 'sale').sort((a, b) => a.amount - b.amount)[0]
  const start = override ?? base
  if (!start) return sale ? { amount: sale.amount, originalAmount: sale.amount, currencyCode: ctx.currencyCode, priceListId: sale.priceList!.id, priceListType: 'sale' } : null

  const winner = sale && sale.amount < start.amount ? sale : start
  return {
    amount: winner.amount,
    originalAmount: base?.amount ?? start.amount,
    currencyCode: ctx.currencyCode,
    priceListId: winner.priceList?.id ?? null,
    priceListType: winner.priceList?.type ?? null,
  }
}

/** Load all candidate prices for these variants and pick one per variant. */
export async function calculatePrices(db: DbLike, variantIds: string[], ctx: PriceContext): Promise<Map<string, CalculatedPrice>> {
  const out = new Map<string, CalculatedPrice>()
  if (!variantIds.length) return out
  const rows = await db
    .select({
      variantId: t.priceSet.variantId,
      amount: t.price.amount,
      currencyCode: t.price.currencyCode,
      regionId: t.price.regionId,
      minQuantity: t.price.minQuantity,
      maxQuantity: t.price.maxQuantity,
      priceListId: t.price.priceListId,
      plId: t.priceList.id,
      plType: t.priceList.type,
      plStatus: t.priceList.status,
      plStartsAt: t.priceList.startsAt,
      plEndsAt: t.priceList.endsAt,
    })
    .from(t.price)
    .innerJoin(t.priceSet, eq(t.priceSet.id, t.price.priceSetId))
    .leftJoin(t.priceList, and(eq(t.priceList.id, t.price.priceListId), isNull(t.priceList.deletedAt)))
    .where(and(inArray(t.priceSet.variantId, variantIds), eq(t.price.currencyCode, ctx.currencyCode), isNull(t.price.deletedAt)))
  const listIds = [...new Set(rows.map((r) => r.plId).filter((x): x is string => Boolean(x)))]
  const groupRows = listIds.length ? await db.select().from(t.priceListCustomerGroup).where(inArray(t.priceListCustomerGroup.priceListId, listIds)) : []

  const byVariant = new Map<string, PriceCandidate[]>()
  for (const r of rows) {
    // A price that points at a deleted price list is ignored entirely.
    if (r.priceListId && !r.plId) continue
    const candidate: PriceCandidate = {
      amount: r.amount,
      currencyCode: r.currencyCode,
      regionId: r.regionId,
      minQuantity: r.minQuantity,
      maxQuantity: r.maxQuantity,
      priceList: r.plId
        ? { id: r.plId, type: r.plType!, status: r.plStatus!, startsAt: r.plStartsAt, endsAt: r.plEndsAt, customerGroupIds: groupRows.filter((g) => g.priceListId === r.plId).map((g) => g.customerGroupId) }
        : null,
    }
    const list = byVariant.get(r.variantId) ?? []
    list.push(candidate)
    byVariant.set(r.variantId, list)
  }
  for (const id of variantIds) {
    const price = pickPrice(byVariant.get(id) ?? [], ctx)
    if (price) out.set(id, price)
  }
  return out
}
