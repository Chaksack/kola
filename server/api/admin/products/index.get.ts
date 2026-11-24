import { productListQuerySchema } from '#shared/schemas/catalog'
import { listProducts } from '../../../services/product'

export default defineValidatedHandler({ query: productListQuerySchema }, async (event, { query }) => {
  await requireAdmin(event)
  const { data, count } = await listProducts(useDb(), query)
  return listResponse(data, count, query.limit, query.offset)
})
