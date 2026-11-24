import { z } from 'zod'
import { idParamSchema } from '#shared/schemas/common'
import { getCartView, publicCart } from '../../../../services/cart'
import { setShippingMethod } from '../../../../services/checkout'

export default defineValidatedHandler({ params: idParamSchema, body: z.object({ optionId: z.string().min(1) }) }, async (event, { params, body }) => {
  const cart = await storeCart(event, params.id)
  await setShippingMethod(useDb(), cart, body.optionId)
  return { cart: publicCart(await getCartView(useDb(), params.id)) }
})
