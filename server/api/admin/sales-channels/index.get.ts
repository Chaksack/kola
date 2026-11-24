import { asc, isNull } from 'drizzle-orm'
import { salesChannel } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb().select().from(salesChannel).where(isNull(salesChannel.deletedAt)).orderBy(asc(salesChannel.createdAt))
  return { data: rows }
})
