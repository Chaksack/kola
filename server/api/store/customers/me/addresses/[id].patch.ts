import { and, eq, isNull } from 'drizzle-orm'
import { customerAddressSchema } from '#shared/schemas/auth'
import { idParamSchema } from '#shared/schemas/common'
import { customerAddress } from '../../../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: customerAddressSchema.partial() }, async (event, { params, body }) => {
  await requirePublishableKey(event)
  const actor = await requireCustomer(event)
  const address = await useTx(async (tx) => {
    const [row] = await tx
      .update(customerAddress)
      .set(body)
      .where(and(eq(customerAddress.id, params.id), eq(customerAddress.customerId, actor.id), isNull(customerAddress.deletedAt)))
      .returning()
    if (!row) throw notFound('Address')
    await clearOtherDefaults(tx, actor.id, row.id, body)
    return row
  })
  return { address }
})
