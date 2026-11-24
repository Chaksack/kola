import { z } from 'zod'
import { exportOrdersChunk } from '../../../services/csv-io'

export default defineValidatedHandler({ query: z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(500) }) }, async (event, { query }) => {
  const actor = await requireAdmin(event)
  const result = await exportOrdersChunk(useDb(), query.offset, query.limit)
  if (query.offset === 0) await audit(event, actor, 'export.orders', 'order', null, { total: result.total })
  return result
})
