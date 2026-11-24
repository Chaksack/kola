import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { productCollection } from '../../../db/schema'

export default defineValidatedHandler({ params: z.object({ handle: z.string().min(1).max(160) }) }, async (event, { params }) => {
  await requirePublishableKey(event)
  const [row] = await useDb()
    .select({ id: productCollection.id, title: productCollection.title, handle: productCollection.handle, description: productCollection.description, thumbnail: productCollection.thumbnail })
    .from(productCollection)
    .where(and(eq(productCollection.handle, params.handle), isNull(productCollection.deletedAt)))
  if (!row) throw notFound('Collection')
  return { collection: row }
})
