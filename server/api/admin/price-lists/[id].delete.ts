import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { price, priceList } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  await useTx(async (tx) => {
    const [row] = await tx.update(priceList).set({ deletedAt: new Date(), status: 'draft' }).where(eq(priceList.id, params.id)).returning({ id: priceList.id })
    if (!row) throw notFound('Price list')
    await tx.delete(price).where(eq(price.priceListId, params.id))
  })
  await audit(event, actor, 'price_list.deleted', 'price_list', params.id)
  return { id: params.id, deleted: true }
})
