import { productInputSchema } from '#shared/schemas/catalog'
import { idParamSchema } from '#shared/schemas/common'
import { getProductDetail, saveProduct } from '../../../services/product'

export default defineValidatedHandler({ params: idParamSchema, body: productInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  await useTx((tx) => saveProduct(tx, body, params.id))
  await audit(event, actor, 'product.updated', 'product', params.id)
  await emitEvent('product.updated', { id: params.id })
  return { product: await getProductDetail(useDb(), params.id) }
})
