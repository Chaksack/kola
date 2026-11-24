import { promotionInputSchema } from '#shared/schemas/marketing'
import { getPromotion, savePromotion } from '../../../services/promotion-admin'

export default defineValidatedHandler({ body: promotionInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const id = await useTx((tx) => savePromotion(tx, body))
  await audit(event, actor, 'promotion.created', 'promotion', id, { code: body.code })
  return { promotion: await getPromotion(useDb(), id) }
})
