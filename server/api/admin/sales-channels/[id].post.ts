import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { salesChannelInputSchema } from '#shared/schemas/region'
import { salesChannel, store } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: salesChannelInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const db = useDb()
  if (body.isDisabled) {
    const [isDefault] = await db.select({ id: store.id }).from(store).where(eq(store.defaultSalesChannelId, params.id))
    if (isDefault) throw conflict("The default sales channel can't be disabled")
  }
  const [row] = await db.update(salesChannel).set(body).where(and(eq(salesChannel.id, params.id), isNull(salesChannel.deletedAt))).returning()
  if (!row) throw notFound('Sales channel')
  await audit(event, actor, 'sales_channel.updated', 'sales_channel', params.id, { isDisabled: body.isDisabled })
  return { salesChannel: row }
})
