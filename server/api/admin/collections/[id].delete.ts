import { and, eq, isNull, sql } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { product, productCollection } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  await useTx(async (tx) => {
    const [row] = await tx
      .update(productCollection)
      .set({ deletedAt: new Date(), handle: sql`${productCollection.handle} || '-deleted-' || ${productCollection.id}` })
      .where(and(eq(productCollection.id, params.id), isNull(productCollection.deletedAt)))
      .returning({ id: productCollection.id })
    if (!row) throw notFound('Collection')
    await tx.update(product).set({ collectionId: null }).where(eq(product.collectionId, params.id))
  })
  await audit(event, actor, 'collection.deleted', 'collection', params.id)
  return { id: params.id, deleted: true }
})
