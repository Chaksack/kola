import { and, eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { order } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event)
  const [row] = await useDb().delete(order).where(and(eq(order.id, params.id), eq(order.isDraft, true))).returning({ id: order.id })
  if (!row) throw notFound('Draft order')
  await audit(event, actor, 'draft_order.deleted', 'order', params.id)
  return { id: params.id, deleted: true }
})
