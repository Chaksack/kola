import { priceListInputSchema } from '#shared/schemas/marketing'
import { priceList, priceListCustomerGroup } from '../../../db/schema'

export default defineValidatedHandler({ body: priceListInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const { customerGroupIds, ...fields } = body
  const row = await useTx(async (tx) => {
    const [pl] = await tx.insert(priceList).values(fields).returning()
    if (customerGroupIds.length) await tx.insert(priceListCustomerGroup).values(customerGroupIds.map((customerGroupId) => ({ priceListId: pl!.id, customerGroupId })))
    return pl!
  })
  await audit(event, actor, 'price_list.created', 'price_list', row.id)
  return { priceList: row }
})
