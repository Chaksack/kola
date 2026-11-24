import { and, eq, isNull } from 'drizzle-orm'
import { storeProductListQuerySchema } from '#shared/schemas/store'
import { productCategory, productCollection } from '../../../db/schema'
import { categoryWithDescendants, listStoreProducts } from '../../../services/storefront'

export default defineValidatedHandler({ query: storeProductListQuerySchema }, async (event, { query }) => {
  const scope = await storeScope(event, query.regionId)
  const db = useDb()
  let collectionId: string | undefined
  if (query.collection) {
    const [c] = await db.select({ id: productCollection.id }).from(productCollection).where(and(eq(productCollection.handle, query.collection), isNull(productCollection.deletedAt)))
    if (!c) return { data: [], count: 0, limit: query.limit, offset: query.offset, facets: { options: {}, price: { min: null, max: null, currencyCode: scope.currencyCode } } }
    collectionId = c.id
  }
  let categoryIds: string[] | undefined
  if (query.category) {
    const [c] = await db.select({ id: productCategory.id }).from(productCategory).where(and(eq(productCategory.handle, query.category), isNull(productCategory.deletedAt), eq(productCategory.isActive, true)))
    categoryIds = c ? await categoryWithDescendants(db, c.id) : ['__none__']
  }
  const result = await listStoreProducts(db, scope, {
    limit: query.limit,
    offset: query.offset,
    q: query.q,
    collectionId,
    categoryIds,
    ids: query.ids,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStock: Boolean(query.inStock),
    optionValues: query.options,
    order: query.order,
  })
  return { ...result, limit: query.limit, offset: query.offset }
})
