import { asc, count, eq, isNull } from 'drizzle-orm'
import { productSalesChannel, salesChannel } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb()
    .select({
      id: salesChannel.id,
      name: salesChannel.name,
      description: salesChannel.description,
      isDisabled: salesChannel.isDisabled,
      createdAt: salesChannel.createdAt,
      productCount: count(productSalesChannel.productId),
    })
    .from(salesChannel)
    .leftJoin(productSalesChannel, eq(productSalesChannel.salesChannelId, salesChannel.id))
    .where(isNull(salesChannel.deletedAt))
    .groupBy(salesChannel.id)
    .orderBy(asc(salesChannel.createdAt))
  return { data: rows }
})
