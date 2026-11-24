import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { customerAddress } from '../../../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requirePublishableKey(event)
  const actor = await requireCustomer(event)
  const [row] = await useDb()
    .update(customerAddress)
    .set({ deletedAt: new Date() })
    .where(and(eq(customerAddress.id, params.id), eq(customerAddress.customerId, actor.id), isNull(customerAddress.deletedAt)))
    .returning({ id: customerAddress.id })
  if (!row) throw notFound('Address')
  return { id: params.id, deleted: true }
})
