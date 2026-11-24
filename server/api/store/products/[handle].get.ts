import { z } from 'zod'
import { regionQuerySchema } from '#shared/schemas/store'
import { getStoreProduct } from '../../../services/storefront'

export default defineValidatedHandler({ params: z.object({ handle: z.string().min(1).max(160) }), query: regionQuerySchema }, async (event, { params, query }) => {
  const scope = await storeScope(event, query.regionId)
  return { product: await getStoreProduct(useDb(), scope, params.handle) }
})
