import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { returnReason } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().update(returnReason).set({ deletedAt: new Date() }).where(eq(returnReason.id, params.id)).returning({ id: returnReason.id })
  if (!row) throw notFound('Return reason')
  await audit(event, actor, 'return_reason.deleted', 'return_reason', params.id)
  return { id: params.id, deleted: true }
})
