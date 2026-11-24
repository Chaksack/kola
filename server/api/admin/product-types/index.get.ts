import { asc, isNull } from 'drizzle-orm'
import { productType } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb().select({ id: productType.id, value: productType.value }).from(productType).where(isNull(productType.deletedAt)).orderBy(asc(productType.value))
  return { data: rows }
})
