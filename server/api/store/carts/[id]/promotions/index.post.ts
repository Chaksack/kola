import { idParamSchema } from '#shared/schemas/common'
import { promoCodeSchema } from '#shared/schemas/store'
import { addPromotionCode, publicCart } from '../../../../../services/cart'

export default defineValidatedHandler({ params: idParamSchema, body: promoCodeSchema }, async (event, { params, body }) => {
  await rateLimit(event, 'promo-code', 20, 300)
  const cart = await storeCart(event, params.id)
  return { cart: publicCart(await addPromotionCode(useDb(), cart, body.code)) }
})
