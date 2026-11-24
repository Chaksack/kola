import { z } from 'zod'
import { convertDraftOrder } from '../../../../services/draft-order'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: z.object({ paid: z.boolean().default(false) }) }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  const name = actor.type === 'user' ? (actor.name ?? actor.email) : 'API key'
  const order = await useTx((tx) => convertDraftOrder(tx, params.id, body.paid, { id: actor.id, name }))
  await audit(event, actor, 'draft_order.converted', 'order', params.id, { paid: body.paid })
  await emitEvent('order.placed', order)
  return { order }
})
