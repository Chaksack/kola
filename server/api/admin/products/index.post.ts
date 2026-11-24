import { productInputSchema } from '#shared/schemas/catalog'
import { getProductDetail, saveProduct } from '../../../services/product'

export default defineValidatedHandler({ body: productInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const { id } = await useTx((tx) => saveProduct(tx, body))
  await audit(event, actor, 'product.created', 'product', id, { title: body.title })
  await emitEvent('product.created', { id })
  return { product: await getProductDetail(useDb(), id) }
})
