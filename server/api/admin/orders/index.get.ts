import { adminOrderListQuerySchema } from '#shared/schemas/order'
import { listAdminOrders } from '../../../services/order-admin'

export default defineValidatedHandler({ query: adminOrderListQuerySchema }, async (event, { query }) => {
  await requireAdmin(event)
  const { data, count, tabs } = await listAdminOrders(useDb(), query)
  return { ...listResponse(data, count, query.limit, query.offset), tabs }
})
