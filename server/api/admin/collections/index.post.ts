import { collectionInputSchema } from '#shared/schemas/catalog'
import { productCollection } from '../../../db/schema'

export default defineValidatedHandler({ body: collectionInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const handle = await uniqueHandle(productCollection, body.handle, body.title)
  const [row] = await useDb().insert(productCollection).values({ ...body, handle }).returning()
  await audit(event, actor, 'collection.created', 'collection', row!.id)
  return { collection: row }
})
