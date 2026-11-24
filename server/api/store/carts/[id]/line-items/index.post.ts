import { idParamSchema } from '#shared/schemas/common'
import { lineItemCreateSchema } from '#shared/schemas/store'
import { addLineItem, getCartView, publicCart } from '../../../../../services/cart'

export default defineValidatedHandler({ params: idParamSchema, body: lineItemCreateSchema }, async (event, { params, body }) => {
  const cart = await storeCart(event, params.id)
  await addLineItem(useDb(), cart, body.variantId, body.quantity)
  return { cart: publicCart(await getCartView(useDb(), params.id)) }
})
