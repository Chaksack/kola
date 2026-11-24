import { z } from 'zod'
import { exportProductsChunk } from '../../../services/csv-io'

export default defineValidatedHandler({ query: z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(200) }) }, async (event, { query }) => {
  const actor = await requireAdmin(event)
  const result = await exportProductsChunk(useDb(), query.offset, query.limit, await storeCurrencies())
  if (query.offset === 0) await audit(event, actor, 'export.products', 'product', null, { total: result.total })
  return result
})
