import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { taxRate } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().update(taxRate).set({ deletedAt: new Date() }).where(and(eq(taxRate.id, params.id), isNull(taxRate.deletedAt))).returning({ id: taxRate.id })
  if (!row) throw notFound('Tax rate')
  await audit(event, actor, 'tax_rate.deleted', 'tax_rate', params.id)
  return { id: params.id, deleted: true }
})
