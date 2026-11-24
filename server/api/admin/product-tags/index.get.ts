import { asc, isNull } from 'drizzle-orm'
import { productTag } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb().select({ id: productTag.id, value: productTag.value }).from(productTag).where(isNull(productTag.deletedAt)).orderBy(asc(productTag.value))
  return { data: rows }
})
