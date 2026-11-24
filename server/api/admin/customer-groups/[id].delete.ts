import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { customerGroup, priceListCustomerGroup } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  await useTx(async (tx) => {
    const [row] = await tx.delete(customerGroup).where(eq(customerGroup.id, params.id)).returning({ id: customerGroup.id })
    if (!row) throw notFound('Customer group')
    await tx.delete(priceListCustomerGroup).where(eq(priceListCustomerGroup.customerGroupId, params.id))
  })
  await audit(event, actor, 'customer_group.deleted', 'customer_group', params.id)
  return { id: params.id, deleted: true }
})
