import { isNull } from 'drizzle-orm'
import { customerListQuerySchema } from '#shared/schemas/marketing'
import { store } from '../../../db/schema'
import { listCustomers } from '../../../services/customer-admin'

export default defineValidatedHandler({ query: customerListQuerySchema }, async (event, { query }) => {
  await requireAdmin(event)
  const [s] = await useDb().select({ currency: store.defaultCurrencyCode }).from(store).where(isNull(store.deletedAt)).limit(1)
  const { data, count } = await listCustomers(useDb(), query, s?.currency ?? 'GHS')
  return listResponse(data, count, query.limit, query.offset)
})
