import { and, asc, eq, isNull } from 'drizzle-orm'
import { productCategory } from '../../../db/schema'

/** Active, public categories, flat with parentId (clients build the tree). */
export default defineApiHandler(async (event) => {
  await requirePublishableKey(event)
  const rows = await useDb()
    .select({ id: productCategory.id, name: productCategory.name, handle: productCategory.handle, description: productCategory.description, parentId: productCategory.parentId, rank: productCategory.rank })
    .from(productCategory)
    .where(and(isNull(productCategory.deletedAt), eq(productCategory.isActive, true), eq(productCategory.isInternal, false)))
    .orderBy(asc(productCategory.rank), asc(productCategory.name))
  return { data: rows }
})
