import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { price } from '../../../../../db/schema'

export default defineValidatedHandler({ params: z.object({ id: z.string(), priceId: z.string() }) }, async (event, { params }) => {
  const actor = await requireAdmin(event)
  const [row] = await useDb().delete(price).where(and(eq(price.id, params.priceId), eq(price.priceListId, params.id))).returning({ id: price.id })
  if (!row) throw notFound('Price')
  await audit(event, actor, 'price_list.price_removed', 'price_list', params.id)
  return { id: params.priceId, deleted: true }
})
