import { customerAddressSchema } from '#shared/schemas/auth'
import { customerAddress } from '../../../../../db/schema'

export default defineValidatedHandler({ body: customerAddressSchema }, async (event, { body }) => {
  await requirePublishableKey(event)
  const actor = await requireCustomer(event)
  const address = await useTx(async (tx) => {
    const [row] = await tx.insert(customerAddress).values({ ...body, customerId: actor.id }).returning()
    await clearOtherDefaults(tx, actor.id, row!.id, body)
    return row!
  })
  return { address }
})
