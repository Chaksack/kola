import { z } from 'zod'
import { addressSchema, emailSchema } from '#shared/schemas/common'
import { createDraftOrder } from '../../../services/draft-order'

const schema = z.object({
  email: emailSchema,
  regionId: z.string().min(1),
  salesChannelId: z.string().nullish(),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1).max(1000), unitPrice: z.number().int().min(0).nullish() })).min(1).max(100),
  shippingOptionId: z.string().nullish(),
  shippingAmount: z.number().int().min(0).nullish(),
  shippingAddress: addressSchema.nullish(),
  note: z.string().trim().max(500).nullish(),
})

export default defineValidatedHandler({ body: schema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const name = actor.type === 'user' ? (actor.name ?? actor.email) : 'API key'
  const draft = await useTx((tx) => createDraftOrder(tx, body, { id: actor.id, name }))
  await audit(event, actor, 'draft_order.created', 'order', draft.id)
  return { draftOrder: draft }
})
