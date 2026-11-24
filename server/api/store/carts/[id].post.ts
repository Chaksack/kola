import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { cartUpdateSchema } from '#shared/schemas/store'
import { cart, cartShippingMethod } from '../../../db/schema'
import { assertOpen, getCartView, publicCart, repriceCart } from '../../../services/cart'

export default defineValidatedHandler({ params: idParamSchema, body: cartUpdateSchema }, async (event, { params, body }) => {
  const current = await storeCart(event, params.id)
  assertOpen(current)
  const db = useDb()
  const patch: Partial<typeof cart.$inferInsert> = {}
  if (body.email !== undefined) patch.email = body.email
  if (body.shippingAddress !== undefined) patch.shippingAddress = body.shippingAddress
  if (body.billingAddress !== undefined) patch.billingAddress = body.billingAddress
  let removed: string[] = []
  const regionChanged = body.regionId && body.regionId !== current.regionId
  if (regionChanged) {
    const region = await resolveRegion(body.regionId)
    patch.regionId = region.id
    patch.currencyCode = region.currencyCode
  }
  // Attach the signed-in customer to an anonymous cart.
  const customer = await getCustomer(event)
  if (customer && !current.customerId) {
    patch.customerId = customer.id
    patch.email ??= current.email ?? customer.email
  }
  const [updated] = await db.update(cart).set(patch).where(eq(cart.id, params.id)).returning()
  if (regionChanged || patch.customerId) {
    removed = await repriceCart(db, updated!)
    // Shipping methods are priced per currency, so a region change clears them.
    if (regionChanged) await db.delete(cartShippingMethod).where(eq(cartShippingMethod.cartId, params.id))
  }
  return { cart: publicCart(await getCartView(db, params.id)), removedItems: removed }
})
