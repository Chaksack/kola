import { and, asc, count, eq, ilike, isNull } from 'drizzle-orm'
import { listQuerySchema } from '#shared/schemas/common'
import { product, productCollection } from '../../../db/schema'

export default defineValidatedHandler({ query: listQuerySchema.extend({ limit: listQuerySchema.shape.limit.default(100) }) }, async (event, { query }) => {
  await requireAdmin(event)
  const db = useDb()
  const where = and(isNull(productCollection.deletedAt), query.q ? ilike(productCollection.title, `%${query.q}%`) : undefined)
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: productCollection.id,
        title: productCollection.title,
        handle: productCollection.handle,
        description: productCollection.description,
        thumbnail: productCollection.thumbnail,
        createdAt: productCollection.createdAt,
        productCount: count(product.id),
      })
      .from(productCollection)
      .leftJoin(product, and(eq(product.collectionId, productCollection.id), isNull(product.deletedAt)))
      .where(where)
      .groupBy(productCollection.id)
      .orderBy(asc(productCollection.title))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(productCollection).where(where),
  ])
  return listResponse(rows, total?.value ?? 0, query.limit, query.offset)
})
