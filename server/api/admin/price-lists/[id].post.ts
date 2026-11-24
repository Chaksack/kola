import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { priceListInputSchema } from '#shared/schemas/marketing'
import { priceList, priceListCustomerGroup } from '../../../db/schema'
import { getPriceList } from '../../../services/promotion-admin'

export default defineValidatedHandler({ params: idParamSchema, body: priceListInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  const { customerGroupIds, ...fields } = body
  await useTx(async (tx) => {
    const [row] = await tx.update(priceList).set(fields).where(and(eq(priceList.id, params.id), isNull(priceList.deletedAt))).returning({ id: priceList.id })
    if (!row) throw notFound('Price list')
    await tx.delete(priceListCustomerGroup).where(eq(priceListCustomerGroup.priceListId, params.id))
    if (customerGroupIds.length) await tx.insert(priceListCustomerGroup).values(customerGroupIds.map((customerGroupId) => ({ priceListId: params.id, customerGroupId })))
  })
  await audit(event, actor, 'price_list.updated', 'price_list', params.id, { status: body.status })
  return { priceList: await getPriceList(useDb(), params.id) }
})
