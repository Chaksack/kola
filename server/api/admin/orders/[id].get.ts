import { idParamSchema } from '#shared/schemas/common'
import { getAdminOrder } from '../../../services/order-admin'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requireAdmin(event)
  return { order: await getAdminOrder(useDb(), params.id) }
})
