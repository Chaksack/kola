import { z } from 'zod'
import { getCartView, publicCart, updateLineItem } from '../../../../../services/cart'

export default defineValidatedHandler({ params: z.object({ id: z.string(), lineId: z.string() }) }, async (event, { params }) => {
  const cart = await storeCart(event, params.id)
  await updateLineItem(useDb(), cart, params.lineId, 0)
  return { cart: publicCart(await getCartView(useDb(), params.id)) }
})
