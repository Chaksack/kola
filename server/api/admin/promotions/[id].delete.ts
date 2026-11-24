import { idParamSchema } from '#shared/schemas/common'
import { deletePromotion } from '../../../services/promotion-admin'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  await deletePromotion(useDb(), params.id)
  await audit(event, actor, 'promotion.deleted', 'promotion', params.id)
  return { id: params.id, deleted: true }
})
