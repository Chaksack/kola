import { asc, count, eq, isNull } from 'drizzle-orm'
import { productCategory, productCategoryProduct } from '../../../db/schema'

/** All categories, flat, with parentId and product counts. The client builds the tree. */
export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb()
    .select({
      id: productCategory.id,
      name: productCategory.name,
      handle: productCategory.handle,
      description: productCategory.description,
      parentId: productCategory.parentId,
      rank: productCategory.rank,
      isActive: productCategory.isActive,
      isInternal: productCategory.isInternal,
      productCount: count(productCategoryProduct.productId),
    })
    .from(productCategory)
    .leftJoin(productCategoryProduct, eq(productCategoryProduct.categoryId, productCategory.id))
    .where(isNull(productCategory.deletedAt))
    .groupBy(productCategory.id)
    .orderBy(asc(productCategory.rank), asc(productCategory.name))
  return { data: rows }
})
