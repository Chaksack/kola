import { and, asc, eq, isNull } from 'drizzle-orm'
import { customerAddress } from '../../../../../db/schema'

export default defineApiHandler(async (event) => {
  await requirePublishableKey(event)
  const actor = await requireCustomer(event)
  const rows = await useDb()
    .select()
    .from(customerAddress)
    .where(and(eq(customerAddress.customerId, actor.id), isNull(customerAddress.deletedAt)))
    .orderBy(asc(customerAddress.createdAt))
  return { data: rows }
})
