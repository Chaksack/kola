import { z } from 'zod'
import { getCartView, publicCart, removePromotionCode } from '../../../../../services/cart'

export default defineValidatedHandler({ params: z.object({ id: z.string(), code: z.string().max(64) }) }, async (event, { params }) => {
  const cart = await storeCart(event, params.id)
  await removePromotionCode(useDb(), cart, params.code)
  return { cart: publicCart(await getCartView(useDb(), params.id)) }
})
