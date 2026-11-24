import { listPriceLists } from '../../../services/promotion-admin'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  return { data: await listPriceLists(useDb()) }
})
