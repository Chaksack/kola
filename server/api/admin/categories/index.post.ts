import { categoryInputSchema } from '#shared/schemas/catalog'
import { productCategory } from '../../../db/schema'

export default defineValidatedHandler({ body: categoryInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const handle = await uniqueHandle(productCategory, body.handle, body.name)
  const [row] = await useDb().insert(productCategory).values({ ...body, handle, parentId: body.parentId || null }).returning()
  await audit(event, actor, 'category.created', 'category', row!.id)
  return { category: row }
})
