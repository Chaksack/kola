import { idParamSchema } from '#shared/schemas/common'
import { getPromotion } from '../../../services/promotion-admin'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requireAdmin(event)
  return { promotion: await getPromotion(useDb(), params.id) }
})
