import { inventoryListQuerySchema } from '#shared/schemas/fulfillment'
import { listInventory } from '../../../services/inventory'

export default defineValidatedHandler({ query: inventoryListQuerySchema }, async (event, { query }) => {
  await requireAdmin(event)
  const { data, count } = await listInventory(useDb(), query)
  return listResponse(data, count, query.limit, query.offset)
})
