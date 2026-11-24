import { idParamSchema } from '#shared/schemas/common'
import { getProductDetail } from '../../../services/product'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requireAdmin(event)
  return { product: await getProductDetail(useDb(), params.id) }
})
