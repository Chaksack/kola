import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { product, productReview } from '../../../db/schema'

export default defineValidatedHandler({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending'), limit: z.coerce.number().int().min(1).max(200).default(20), offset: z.coerce.number().int().min(0).default(0) }) }, async (event, { query }) => {
  await requireAdmin(event)
  const db = useDb()
  const where = eq(productReview.status, query.status)
  const [rows, [total], counts] = await Promise.all([
    db
      .select({ r: productReview, productTitle: product.title, productHandle: product.handle })
      .from(productReview)
      .innerJoin(product, eq(product.id, productReview.productId))
      .where(where)
      .orderBy(desc(productReview.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(productReview).where(where),
    db.select({ status: productReview.status, n: count() }).from(productReview).groupBy(productReview.status),
  ])
  return { ...listResponse(rows.map(({ r, productTitle, productHandle }) => ({ ...r, productTitle, productHandle })), total?.value ?? 0, query.limit, query.offset), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) }
})
