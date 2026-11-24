import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { productType } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().delete(productType).where(eq(productType.id, params.id)).returning({ id: productType.id })
  if (!row) throw notFound('Value')
  await audit(event, actor, 'productType.deleted', 'productType', params.id)
  return { id: params.id, deleted: true }
})
