import { asc, isNull } from 'drizzle-orm'
import { returnReason } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  return { data: await useDb().select().from(returnReason).where(isNull(returnReason.deletedAt)).orderBy(asc(returnReason.label)) }
})
