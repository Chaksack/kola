import { idParamSchema } from '#shared/schemas/common'
import { getCustomerDetail } from '../../../services/customer-admin'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requireAdmin(event)
  return { customer: await getCustomerDetail(useDb(), params.id) }
})
