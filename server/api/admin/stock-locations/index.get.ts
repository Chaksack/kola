import { asc, isNull } from 'drizzle-orm'
import { stockLocation } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb().select().from(stockLocation).where(isNull(stockLocation.deletedAt)).orderBy(asc(stockLocation.createdAt))
  return { data: rows }
})
