import { shippingOptionInputSchema } from '#shared/schemas/fulfillment'
import { shippingOption, shippingOptionPrice } from '../../../db/schema'

export default defineValidatedHandler({ body: shippingOptionInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  const { prices, ...fields } = body
  const option = await useTx(async (tx) => {
    const [row] = await tx.insert(shippingOption).values(fields).returning()
    if (prices.length) await tx.insert(shippingOptionPrice).values(prices.map((p) => ({ ...p, regionId: p.regionId || null, shippingOptionId: row!.id })))
    return row!
  })
  await audit(event, actor, 'shipping_option.created', 'shipping_option', option.id)
  return { shippingOption: option }
})
