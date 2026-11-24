/**
 * Read models for the storefront: published products visible in the caller's sales channels, priced
 * for a region. Sorting and filtering by price use the base price in the region's currency (cheap,
 * done in SQL); the price shown is the fully calculated one (price lists included) for the page.
 */
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import * as t from '../db/schema'
import { calculatePrices, type CalculatedPrice } from './pricing'
import { notFound } from './errors'

export interface StoreScope {
  salesChannelIds: string[]
  regionId: string
  currencyCode: string
  customerGroupIds?: string[]
}

export interface StoreProductQuery {
  limit: number
  offset: number
  q?: string
  collectionId?: string
  categoryIds?: string[]
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  optionValues?: string[]
  ids?: string[]
  order: 'newest' | 'price_asc' | 'price_desc' | 'title'
}

export interface ProductCard {
  id: string
  title: string
  handle: string
  subtitle: string | null
  thumbnail: string | null
  collection: { title: string; handle: string } | null
  price: CalculatedPrice | null
  priceVaries: boolean
  inStock: boolean
}

/**
 * Lowest price per product in the region currency, for sorting and price filters: base prices plus
 * active price lists that apply to everyone (customer-group lists only affect the displayed price).
 */
function minBasePrice(scope: StoreScope) {
  return sql<number | null>`(
    select min(pr.amount) from ${t.price} pr
    join ${t.priceSet} ps on ps.id = pr.price_set_id
    join ${t.productVariant} pv on pv.id = ps.variant_id
    left join ${t.priceList} pl on pl.id = pr.price_list_id
    where pv.product_id = ${t.product.id} and pv.deleted_at is null and pr.deleted_at is null
      and pr.currency_code = ${scope.currencyCode}
      and (pr.region_id is null or pr.region_id = ${scope.regionId})
      and (pr.price_list_id is null or (
        pl.deleted_at is null and pl.status = 'active'
        and (pl.starts_at is null or pl.starts_at <= now()) and (pl.ends_at is null or pl.ends_at >= now())
        and not exists (select 1 from ${t.priceListCustomerGroup} g where g.price_list_id = pl.id)
      ))
  )`
}

/** A variant can be bought when stock isn't tracked, backorders are allowed, or something is available. */
const variantAvailable = sql`(
  ${t.productVariant.manageInventory} = false or ${t.productVariant.allowBackorder} = true or exists (
    select 1 from ${t.inventoryItem} ii join ${t.inventoryLevel} il on il.inventory_item_id = ii.id
    where ii.variant_id = ${t.productVariant.id} group by ii.id having sum(il.stocked - il.reserved) > 0
  )
)`

function baseFilters(db: DbLike, scope: StoreScope, q: Omit<StoreProductQuery, 'limit' | 'offset' | 'order'>): (SQL | undefined)[] {
  const p = t.product
  const f: (SQL | undefined)[] = [
    isNull(p.deletedAt),
    eq(p.status, 'published'),
    exists(db.select({ x: sql`1` }).from(t.productSalesChannel).where(and(eq(t.productSalesChannel.productId, p.id), inArray(t.productSalesChannel.salesChannelId, scope.salesChannelIds)))),
  ]
  if (q.ids?.length) f.push(inArray(p.id, q.ids))
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, '\\$&')}%`
    f.push(or(ilike(p.title, like), ilike(p.subtitle, like), ilike(p.description, like)))
  }
  if (q.collectionId) f.push(eq(p.collectionId, q.collectionId))
  if (q.categoryIds?.length) {
    f.push(exists(db.select({ x: sql`1` }).from(t.productCategoryProduct).where(and(eq(t.productCategoryProduct.productId, p.id), inArray(t.productCategoryProduct.categoryId, q.categoryIds)))))
  }
  if (q.inStock) {
    f.push(exists(db.select({ x: sql`1` }).from(t.productVariant).where(and(eq(t.productVariant.productId, p.id), isNull(t.productVariant.deletedAt), variantAvailable))))
  }
  if (q.minPrice !== undefined) f.push(gte(minBasePrice(scope), q.minPrice))
  if (q.maxPrice !== undefined) f.push(lte(minBasePrice(scope), q.maxPrice))
  return f
}

function optionFilter(db: DbLike, values: string[]) {
  return exists(
    db
      .select({ x: sql`1` })
      .from(t.productVariant)
      .innerJoin(t.variantOptionValue, eq(t.variantOptionValue.variantId, t.productVariant.id))
      .innerJoin(t.productOptionValue, eq(t.productOptionValue.id, t.variantOptionValue.optionValueId))
      .where(and(eq(t.productVariant.productId, t.product.id), isNull(t.productVariant.deletedAt), inArray(t.productOptionValue.value, values))),
  )
}

/** Build cards (prices, stock, collection) for a set of product rows. */
export async function toCards(
  db: DbLike,
  scope: StoreScope,
  rows: { id: string; title: string; handle: string; subtitle: string | null; thumbnail: string | null; collectionTitle: string | null; collectionHandle: string | null }[],
): Promise<ProductCard[]> {
  if (!rows.length) return []
  const variants = await db
    .select({ id: t.productVariant.id, productId: t.productVariant.productId, available: sql<boolean>`${variantAvailable}` })
    .from(t.productVariant)
    .where(and(inArray(t.productVariant.productId, rows.map((r) => r.id)), isNull(t.productVariant.deletedAt)))
  const prices = await calculatePrices(db, variants.map((v) => v.id), scope)
  return rows.map((r) => {
    const own = variants.filter((v) => v.productId === r.id)
    const priced = own.map((v) => prices.get(v.id)).filter((x): x is CalculatedPrice => Boolean(x))
    const cheapest = priced.sort((a, b) => a.amount - b.amount)[0] ?? null
    return {
      id: r.id,
      title: r.title,
      handle: r.handle,
      subtitle: r.subtitle,
      thumbnail: r.thumbnail,
      collection: r.collectionHandle ? { title: r.collectionTitle!, handle: r.collectionHandle } : null,
      price: cheapest,
      priceVaries: new Set(priced.map((x) => x.amount)).size > 1,
      inStock: own.some((v) => v.available),
    }
  })
}

const cardColumns = {
  id: t.product.id,
  title: t.product.title,
  handle: t.product.handle,
  subtitle: t.product.subtitle,
  thumbnail: t.product.thumbnail,
  collectionTitle: t.productCollection.title,
  collectionHandle: t.productCollection.handle,
}

export async function listStoreProducts(db: DbLike, scope: StoreScope, q: StoreProductQuery) {
  const filters = baseFilters(db, scope, q)
  const where = and(...filters, q.optionValues?.length ? optionFilter(db, q.optionValues) : undefined)
  const price = minBasePrice(scope)
  const order = {
    newest: [desc(t.product.createdAt), desc(t.product.id)],
    title: [asc(t.product.title)],
    price_asc: [sql`${price} asc nulls last`, asc(t.product.title)],
    price_desc: [sql`${price} desc nulls last`, asc(t.product.title)],
  }[q.order]
  const [rows, [total]] = await Promise.all([
    db.select(cardColumns).from(t.product).leftJoin(t.productCollection, eq(t.productCollection.id, t.product.collectionId)).where(where).orderBy(...order).limit(q.limit).offset(q.offset),
    db.select({ value: sql<number>`count(*)::int` }).from(t.product).where(where),
  ])

  // Facets come from the listing without the option filter, so picking one value doesn't hide the others.
  const facetWhere = and(...filters)
  const [optionFacets, [range]] = await Promise.all([
    db
      .selectDistinct({ title: t.productOption.title, value: t.productOptionValue.value, rank: t.productOptionValue.rank })
      .from(t.productOptionValue)
      .innerJoin(t.productOption, eq(t.productOption.id, t.productOptionValue.optionId))
      .innerJoin(t.product, eq(t.product.id, t.productOption.productId))
      .where(facetWhere)
      .orderBy(asc(t.productOption.title), asc(t.productOptionValue.rank)),
    db.select({ min: sql<number | null>`min(${price})`, max: sql<number | null>`max(${price})` }).from(t.product).where(and(...baseFilters(db, scope, { ...q, minPrice: undefined, maxPrice: undefined }))),
  ])
  const options: Record<string, string[]> = {}
  for (const f of optionFacets) {
    const list = (options[f.title] ??= [])
    if (!list.includes(f.value)) list.push(f.value)
  }
  return {
    data: await toCards(db, scope, rows),
    count: total?.value ?? 0,
    facets: { options, price: { min: range?.min ?? null, max: range?.max ?? null, currencyCode: scope.currencyCode } },
  }
}

export async function getStoreProduct(db: DbLike, scope: StoreScope, handle: string) {
  const [p] = await db
    .select()
    .from(t.product)
    .where(and(eq(t.product.handle, handle), ...baseFilters(db, scope, {})))
  if (!p) throw notFound('Product')

  const [options, variants, images, collection, categories] = await Promise.all([
    db.select().from(t.productOption).where(eq(t.productOption.productId, p.id)).orderBy(asc(t.productOption.rank)),
    db
      .select({
        id: t.productVariant.id,
        title: t.productVariant.title,
        sku: t.productVariant.sku,
        manageInventory: t.productVariant.manageInventory,
        allowBackorder: t.productVariant.allowBackorder,
        rank: t.productVariant.rank,
      })
      .from(t.productVariant)
      .where(and(eq(t.productVariant.productId, p.id), isNull(t.productVariant.deletedAt)))
      .orderBy(asc(t.productVariant.rank)),
    db.select({ url: t.productImage.url, alt: t.productImage.alt }).from(t.productImage).where(eq(t.productImage.productId, p.id)).orderBy(asc(t.productImage.rank)),
    p.collectionId ? db.select({ id: t.productCollection.id, title: t.productCollection.title, handle: t.productCollection.handle }).from(t.productCollection).where(eq(t.productCollection.id, p.collectionId)) : Promise.resolve([]),
    db
      .select({ id: t.productCategory.id, name: t.productCategory.name, handle: t.productCategory.handle, parentId: t.productCategory.parentId })
      .from(t.productCategoryProduct)
      .innerJoin(t.productCategory, eq(t.productCategory.id, t.productCategoryProduct.categoryId))
      .where(and(eq(t.productCategoryProduct.productId, p.id), eq(t.productCategory.isActive, true), eq(t.productCategory.isInternal, false))),
  ])
  const variantIds = variants.map((v) => v.id)
  const [values, links, stock, prices] = await Promise.all([
    options.length ? db.select().from(t.productOptionValue).where(inArray(t.productOptionValue.optionId, options.map((o) => o.id))).orderBy(asc(t.productOptionValue.rank)) : Promise.resolve([]),
    variantIds.length ? db.select().from(t.variantOptionValue).where(inArray(t.variantOptionValue.variantId, variantIds)) : Promise.resolve([]),
    variantIds.length
      ? db
          .select({ variantId: t.inventoryItem.variantId, threshold: t.inventoryItem.lowStockThreshold, available: sql<number>`coalesce(sum(${t.inventoryLevel.stocked} - ${t.inventoryLevel.reserved}), 0)::int` })
          .from(t.inventoryItem)
          .leftJoin(t.inventoryLevel, eq(t.inventoryLevel.inventoryItemId, t.inventoryItem.id))
          .where(inArray(t.inventoryItem.variantId, variantIds))
          .groupBy(t.inventoryItem.id)
      : Promise.resolve([]),
    calculatePrices(db, variantIds, scope),
  ])
  const valueById = new Map(values.map((v) => [v.id, v]))
  const optionById = new Map(options.map((o) => [o.id, o]))

  const shapedVariants = variants.map((v) => {
    const s = stock.find((x) => x.variantId === v.id)
    const available = v.manageInventory ? Math.max(0, s?.available ?? 0) : null
    const inStock = !v.manageInventory || v.allowBackorder || (available ?? 0) > 0
    const opts: Record<string, string> = {}
    for (const l of links.filter((x) => x.variantId === v.id)) {
      const val = valueById.get(l.optionValueId)
      const opt = val && optionById.get(val.optionId)
      if (val && opt) opts[opt.title] = val.value
    }
    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      options: opts,
      price: prices.get(v.id) ?? null,
      inStock,
      allowBackorder: v.allowBackorder,
      // Only reveal exact counts when stock is low, as a nudge.
      lowStock: available !== null && available > 0 && available <= (s?.threshold ?? 5) ? available : null,
    }
  })

  // Related: same collection first, then shared categories.
  const relatedWhere = and(
    ...baseFilters(db, scope, {}),
    sql`${t.product.id} <> ${p.id}`,
    or(
      p.collectionId ? eq(t.product.collectionId, p.collectionId) : undefined,
      categories.length ? exists(db.select({ x: sql`1` }).from(t.productCategoryProduct).where(and(eq(t.productCategoryProduct.productId, t.product.id), inArray(t.productCategoryProduct.categoryId, categories.map((c) => c.id))))) : undefined,
    ),
  )
  const relatedRows = p.collectionId || categories.length
    ? await db.select(cardColumns).from(t.product).leftJoin(t.productCollection, eq(t.productCollection.id, t.product.collectionId)).where(relatedWhere).orderBy(desc(t.product.createdAt)).limit(4)
    : []

  return {
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    handle: p.handle,
    description: p.description,
    thumbnail: p.thumbnail,
    isGiftcard: p.isGiftcard,
    material: p.material,
    weight: p.weight,
    originCountry: p.originCountry,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    images: images.length ? images : p.thumbnail ? [{ url: p.thumbnail, alt: p.title }] : [],
    collection: collection[0] ?? null,
    categories,
    options: options.map((o) => ({ title: o.title, values: values.filter((v) => v.optionId === o.id).map((v) => v.value) })),
    variants: shapedVariants,
    related: await toCards(db, scope, relatedRows),
  }
}
export type StoreProduct = Awaited<ReturnType<typeof getStoreProduct>>

/** All descendant ids of a category, including itself. */
export async function categoryWithDescendants(db: DbLike, rootId: string): Promise<string[]> {
  const all = await db.select({ id: t.productCategory.id, parentId: t.productCategory.parentId }).from(t.productCategory).where(and(isNull(t.productCategory.deletedAt), eq(t.productCategory.isActive, true)))
  const out = [rootId]
  for (let i = 0; i < out.length; i++) for (const c of all) if (c.parentId === out[i]) out.push(c.id)
  return out
}
