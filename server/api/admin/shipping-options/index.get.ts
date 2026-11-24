import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { region, shippingOption, shippingOptionPrice } from '../../../db/schema'

/** Shipping options with a price in the region's currency (admin-only options included). */
export default defineValidatedHandler({ query: z.object({ regionId: z.string() }) }, async (event, { query }) => {
  await requireAdmin(event)
  const db = useDb()
  const [r] = await db.select().from(region).where(eq(region.id, query.regionId))
  if (!r) throw notFound('Region')
  const rows = await db
    .select({ id: shippingOption.id, name: shippingOption.name, isReturn: shippingOption.isReturn, adminOnly: shippingOption.adminOnly, amount: shippingOptionPrice.amount, priceRegionId: shippingOptionPrice.regionId })
    .from(shippingOption)
    .innerJoin(shippingOptionPrice, and(eq(shippingOptionPrice.shippingOptionId, shippingOption.id), eq(shippingOptionPrice.currencyCode, r.currencyCode)))
    .where(and(isNull(shippingOption.deletedAt), eq(shippingOption.isReturn, false)))
  const unique = new Map<string, (typeof rows)[number]>()
  for (const row of rows) if (!row.priceRegionId || row.priceRegionId === r.id) if (!unique.has(row.id) || row.priceRegionId) unique.set(row.id, row)
  return { data: [...unique.values()].map(({ priceRegionId: _p, ...o }) => ({ ...o, currencyCode: r.currencyCode })) }
})
