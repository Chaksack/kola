import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { product, productReview } from '../../../../db/schema'

/** Approved reviews for a product, with the average rating. */
export default defineValidatedHandler({ params: z.object({ handle: z.string().max(160) }) }, async (event, { params }) => {
  await requirePublishableKey(event)
  const db = useDb()
  const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.handle, params.handle), isNull(product.deletedAt), eq(product.status, 'published')))
  if (!p) throw notFound('Product')
  const where = and(eq(productReview.productId, p.id), eq(productReview.status, 'approved'))
  const [rows, [summary]] = await Promise.all([
    db.select({ id: productReview.id, authorName: productReview.authorName, rating: productReview.rating, title: productReview.title, body: productReview.body, createdAt: productReview.createdAt }).from(productReview).where(where).orderBy(desc(productReview.createdAt)).limit(20),
    db.select({ count: sql<number>`count(*)::int`, average: sql<number | null>`round(avg(${productReview.rating})::numeric, 1)::float` }).from(productReview).where(where),
  ])
  return { data: rows, count: summary?.count ?? 0, average: summary?.average ?? null }
})
