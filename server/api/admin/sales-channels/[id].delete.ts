import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { apiKeySalesChannel, productSalesChannel, salesChannel, store } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  await useTx(async (tx) => {
    const [isDefault] = await tx.select({ id: store.id }).from(store).where(eq(store.defaultSalesChannelId, params.id))
    if (isDefault) throw conflict("The default sales channel can't be deleted")
    const [row] = await tx.update(salesChannel).set({ deletedAt: new Date() }).where(and(eq(salesChannel.id, params.id), isNull(salesChannel.deletedAt))).returning({ id: salesChannel.id })
    if (!row) throw notFound('Sales channel')
    await tx.delete(productSalesChannel).where(eq(productSalesChannel.salesChannelId, params.id))
    await tx.delete(apiKeySalesChannel).where(eq(apiKeySalesChannel.salesChannelId, params.id))
  })
  await audit(event, actor, 'sales_channel.deleted', 'sales_channel', params.id)
  return { id: params.id, deleted: true }
})
