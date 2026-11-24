import { z } from 'zod'
import { listPromotions } from '../../../services/promotion-admin'

export default defineValidatedHandler({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(20), offset: z.coerce.number().int().min(0).default(0), q: z.string().max(60).optional(), status: z.enum(['draft', 'active', 'inactive']).optional() }) }, async (event, { query }) => {
  await requireAdmin(event)
  const { data, count } = await listPromotions(useDb(), query)
  return listResponse(data, count, query.limit, query.offset)
})
