import { and, asc, count, eq, exists, inArray, isNull, sql } from 'drizzle-orm'
import { product, productCollection, productSalesChannel } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  const { salesChannelIds } = await requirePublishableKey(event)
  const db = useDb()
  const rows = await db
    .select({ id: productCollection.id, title: productCollection.title, handle: productCollection.handle, description: productCollection.description, thumbnail: productCollection.thumbnail, productCount: count(product.id) })
    .from(productCollection)
    .leftJoin(
      product,
      and(
        eq(product.collectionId, productCollection.id),
        isNull(product.deletedAt),
        eq(product.status, 'published'),
        exists(db.select({ x: sql`1` }).from(productSalesChannel).where(and(eq(productSalesChannel.productId, product.id), inArray(productSalesChannel.salesChannelId, salesChannelIds)))),
      ),
    )
    .where(isNull(productCollection.deletedAt))
    .groupBy(productCollection.id)
    .orderBy(asc(productCollection.title))
  return { data: rows }
})
