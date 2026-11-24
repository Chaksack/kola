import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { shippingOption } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().update(shippingOption).set({ deletedAt: new Date() }).where(and(eq(shippingOption.id, params.id), isNull(shippingOption.deletedAt))).returning({ id: shippingOption.id })
  if (!row) throw notFound('Shipping option')
  await audit(event, actor, 'shipping_option.deleted', 'shipping_option', params.id)
  return { id: params.id, deleted: true }
})
