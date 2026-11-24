import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { order } from '../../../db/schema'
import { getStoreOrder } from '../../../services/order'

/** Find an order by its display number (#10482) and email. */
export default defineValidatedHandler({ body: z.object({ displayId: z.coerce.number().int().positive(), email: z.string().trim().toLowerCase().email() }) }, async (event, { body }) => {
  await requirePublishableKey(event)
  await rateLimit(event, 'order-lookup', 30, 300)
  const [row] = await useDb().select({ id: order.id, email: order.email }).from(order).where(and(eq(order.displayId, body.displayId), isNull(order.deletedAt), eq(order.isDraft, false)))
  if (!row || row.email.toLowerCase() !== body.email) throw notFound('Order')
  return { order: await getStoreOrder(useDb(), row.id) }
})
