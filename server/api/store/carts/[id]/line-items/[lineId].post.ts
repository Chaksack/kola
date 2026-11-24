import { z } from 'zod'
import { lineItemUpdateSchema } from '#shared/schemas/store'
import { getCartView, publicCart, updateLineItem } from '../../../../../services/cart'

export default defineValidatedHandler({ params: z.object({ id: z.string(), lineId: z.string() }), body: lineItemUpdateSchema }, async (event, { params, body }) => {
  const cart = await storeCart(event, params.id)
  await updateLineItem(useDb(), cart, params.lineId, body.quantity)
  return { cart: publicCart(await getCartView(useDb(), params.id)) }
})
