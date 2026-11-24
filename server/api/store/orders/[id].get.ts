import { z } from 'zod'
import { getStoreOrder } from '../../../services/order'

/** Order lookup: the signed-in owner, or anyone with the order id plus its email. */
export default defineValidatedHandler({ params: z.object({ id: z.string().min(1).max(64) }), query: z.object({ email: z.string().trim().toLowerCase().max(254).optional() }) }, async (event, { params, query }) => {
  await requirePublishableKey(event)
  await rateLimit(event, 'order-lookup', 30, 300)
  const order = await getStoreOrder(useDb(), params.id).catch(() => null)
  const customer = await getCustomer(event)
  const owns = order && customer && (await isOrderOwner(order.id, customer.id))
  // Same response for "not found" and "wrong email" so order ids can't be probed.
  if (!order || (!owns && order.email.toLowerCase() !== query.email)) throw notFound('Order')
  return { order }
})
