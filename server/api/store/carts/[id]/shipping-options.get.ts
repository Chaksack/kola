import { idParamSchema } from '#shared/schemas/common'
import { getCartView } from '../../../../services/cart'
import { listShippingOptions } from '../../../../services/checkout'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await storeCart(event, params.id)
  const view = await getCartView(useDb(), params.id)
  return { data: await listShippingOptions(useDb(), view) }
})
