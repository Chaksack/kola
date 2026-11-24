import { listDraftOrders } from '../../../services/draft-order'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  return { data: await listDraftOrders(useDb()) }
})
