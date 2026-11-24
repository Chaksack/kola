import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { productCategory } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  // Hard delete: children and product links cascade. Products themselves are untouched.
  const [row] = await useDb().delete(productCategory).where(eq(productCategory.id, params.id)).returning({ id: productCategory.id })
  if (!row) throw notFound('Category')
  await audit(event, actor, 'category.deleted', 'category', params.id)
  return { id: params.id, deleted: true }
})
