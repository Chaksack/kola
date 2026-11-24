import { cartCreateSchema } from '#shared/schemas/store'
import { cart } from '../../../db/schema'
import { CART_TTL_DAYS, getCartView, publicCart } from '../../../services/cart'

export default defineValidatedHandler({ body: cartCreateSchema }, async (event, { body }) => {
  const { salesChannelIds } = await requirePublishableKey(event)
  await rateLimit(event, 'cart-create', 60, 600)
  const region = await resolveRegion(body.regionId)
  const customer = await getCustomer(event)
  const [row] = await useDb()
    .insert(cart)
    .values({
      regionId: region.id,
      currencyCode: region.currencyCode,
      salesChannelId: salesChannelIds[0]!,
      customerId: customer?.id ?? null,
      email: body.email ?? customer?.email ?? null,
      expiresAt: new Date(Date.now() + CART_TTL_DAYS * 86_400_000),
    })
    .returning({ id: cart.id })
  return { cart: publicCart(await getCartView(useDb(), row!.id)) }
})
