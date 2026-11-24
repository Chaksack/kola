import { and, eq, isNull } from 'drizzle-orm'
import { categoryInputSchema } from '#shared/schemas/catalog'
import { idParamSchema } from '#shared/schemas/common'
import { productCategory } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: categoryInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  const db = useDb()
  const parentId = body.parentId || null
  // Refuse cycles: the new parent must not be this category or one of its descendants.
  for (let cursor = parentId; cursor; ) {
    if (cursor === params.id) throw badRequest('A category cannot be moved inside itself', [{ path: 'parentId', message: 'Pick another parent' }])
    const [p] = await db.select({ parentId: productCategory.parentId }).from(productCategory).where(eq(productCategory.id, cursor))
    cursor = p?.parentId ?? null
  }
  const handle = await uniqueHandle(productCategory, body.handle, body.name, params.id)
  const [row] = await db
    .update(productCategory)
    .set({ ...body, handle, parentId })
    .where(and(eq(productCategory.id, params.id), isNull(productCategory.deletedAt)))
    .returning()
  if (!row) throw notFound('Category')
  await audit(event, actor, 'category.updated', 'category', params.id)
  return { category: row }
})
