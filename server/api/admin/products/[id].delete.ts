import { idParamSchema } from '#shared/schemas/common'
import { deleteProduct } from '../../../services/product'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  await useTx((tx) => deleteProduct(tx, params.id))
  await audit(event, actor, 'product.deleted', 'product', params.id)
  await emitEvent('product.deleted', { id: params.id })
  return { id: params.id, deleted: true }
})
