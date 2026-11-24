import { listQuerySchema } from '#shared/schemas/common'
import { listCustomerOrders } from '../../../../../services/order'

export default defineValidatedHandler({ query: listQuerySchema }, async (event, { query }) => {
  await requirePublishableKey(event)
  const customer = await requireCustomer(event)
  return { data: await listCustomerOrders(useDb(), customer.id, query.limit, query.offset) }
})
