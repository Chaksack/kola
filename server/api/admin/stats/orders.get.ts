import { isNull } from 'drizzle-orm'
import { store } from '../../../db/schema'
import { orderStats } from '../../../services/order-admin'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const [s] = await useDb().select({ currency: store.defaultCurrencyCode }).from(store).where(isNull(store.deletedAt)).limit(1)
  return orderStats(useDb(), s?.currency ?? 'GHS')
})
