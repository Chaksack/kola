import { and, count, eq, inArray, isNull, ne } from 'drizzle-orm'
import { order } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const [row] = await useDb()
    .select({ value: count() })
    .from(order)
    .where(and(isNull(order.deletedAt), eq(order.isDraft, false), ne(order.status, 'canceled'), inArray(order.fulfillmentStatus, ['not_fulfilled', 'partially_fulfilled'])))
  return { unfulfilled: row?.value ?? 0 }
})
