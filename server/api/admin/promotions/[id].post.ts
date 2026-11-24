import { idParamSchema } from '#shared/schemas/common'
import { promotionInputSchema } from '#shared/schemas/marketing'
import { getPromotion, savePromotion } from '../../../services/promotion-admin'

export default defineValidatedHandler({ params: idParamSchema, body: promotionInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  await useTx((tx) => savePromotion(tx, body, params.id))
  await audit(event, actor, 'promotion.updated', 'promotion', params.id, { status: body.status })
  return { promotion: await getPromotion(useDb(), params.id) }
})
