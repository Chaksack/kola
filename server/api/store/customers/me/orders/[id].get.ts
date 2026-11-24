import { idParamSchema } from '#shared/schemas/common'
import { getStoreOrder } from '../../../../../services/order'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requirePublishableKey(event)
  const customer = await requireCustomer(event)
  if (!(await isOrderOwner(params.id, customer.id))) throw notFound('Order')
  return { order: await getStoreOrder(useDb(), params.id) }
})
