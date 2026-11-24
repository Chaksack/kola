import { and, eq, isNull } from 'drizzle-orm'
import { collectionInputSchema } from '#shared/schemas/catalog'
import { idParamSchema } from '#shared/schemas/common'
import { productCollection } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: collectionInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  const handle = await uniqueHandle(productCollection, body.handle, body.title, params.id)
  const [row] = await useDb()
    .update(productCollection)
    .set({ ...body, handle })
    .where(and(eq(productCollection.id, params.id), isNull(productCollection.deletedAt)))
    .returning()
  if (!row) throw notFound('Collection')
  await audit(event, actor, 'collection.updated', 'collection', params.id)
  return { collection: row }
})
