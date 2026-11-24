import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { productTag } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().delete(productTag).where(eq(productTag.id, params.id)).returning({ id: productTag.id })
  if (!row) throw notFound('Value')
  await audit(event, actor, 'productTag.deleted', 'productTag', params.id)
  return { id: params.id, deleted: true }
})
