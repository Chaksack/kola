import { idParamSchema } from '#shared/schemas/common'
import { getCartView, publicCart } from '../../../services/cart'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await storeCart(event, params.id)
  return { cart: publicCart(await getCartView(useDb(), params.id)) }
})
