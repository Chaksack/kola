import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { priceListPricesSchema } from '#shared/schemas/marketing'
import { priceList } from '../../../../../db/schema'
import { getPriceList, setPriceListPrices } from '../../../../../services/promotion-admin'

export default defineValidatedHandler({ params: idParamSchema, body: priceListPricesSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  await useTx(async (tx) => {
    const [pl] = await tx.select({ id: priceList.id }).from(priceList).where(and(eq(priceList.id, params.id), isNull(priceList.deletedAt)))
    if (!pl) throw notFound('Price list')
    await setPriceListPrices(tx, params.id, body.prices, body.replaceVariants)
  })
  await audit(event, actor, 'price_list.prices_set', 'price_list', params.id, { count: body.prices.length })
  return { priceList: await getPriceList(useDb(), params.id) }
})
