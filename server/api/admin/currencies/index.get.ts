import { asc } from 'drizzle-orm'
import { currency } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  return { data: await useDb().select().from(currency).orderBy(asc(currency.code)) }
})
