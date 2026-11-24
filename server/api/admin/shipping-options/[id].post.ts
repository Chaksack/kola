import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { shippingOptionInputSchema } from '#shared/schemas/fulfillment'
import { shippingOption, shippingOptionPrice } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: shippingOptionInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const { prices, ...fields } = body
  const option = await useTx(async (tx) => {
    const [row] = await tx.update(shippingOption).set(fields).where(and(eq(shippingOption.id, params.id), isNull(shippingOption.deletedAt))).returning()
    if (!row) throw notFound('Shipping option')
    await tx.delete(shippingOptionPrice).where(eq(shippingOptionPrice.shippingOptionId, params.id))
    if (prices.length) await tx.insert(shippingOptionPrice).values(prices.map((p) => ({ ...p, regionId: p.regionId || null, shippingOptionId: params.id })))
    return row
  })
  await audit(event, actor, 'shipping_option.updated', 'shipping_option', params.id)
  return { shippingOption: option }
})
