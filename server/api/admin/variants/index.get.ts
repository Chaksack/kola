import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { product, productVariant } from '../../../db/schema'

/** Variant picker for order edits, exchanges and draft orders. */
export default defineValidatedHandler({ query: z.object({ q: z.string().trim().max(100).default(''), limit: z.coerce.number().int().min(1).max(50).default(20) }) }, async (event, { query }) => {
  await requireAdmin(event)
  const like = `%${query.q}%`
  const rows = await useDb()
    .select({ id: productVariant.id, title: productVariant.title, sku: productVariant.sku, productTitle: product.title, thumbnail: product.thumbnail, handle: product.handle })
    .from(productVariant)
    .innerJoin(product, eq(product.id, productVariant.productId))
    .where(and(isNull(productVariant.deletedAt), isNull(product.deletedAt), query.q ? or(ilike(product.title, like), ilike(productVariant.sku, like), ilike(productVariant.title, like)) : undefined))
    .orderBy(asc(product.title), asc(productVariant.rank))
    .limit(query.limit)
  return { data: rows }
})
