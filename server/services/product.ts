/**
 * Catalog service: list, read and save products with their options, variants, prices, inventory
 * levels, media and links. Framework-agnostic: takes a db handle, throws ApiError.
 */
import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm'
import type { DbLike, Tx } from '../db/client'
import * as t from '../db/schema'
import { toHandle, type ProductInputParsed } from '../../shared/schemas/catalog'
import { conflict, notFound } from './errors'

// ── List ────────────────────────────────────────────────────────────────

export interface ProductListQuery {
  limit: number
  offset: number
  q?: string
  status?: (typeof t.PRODUCT_STATUSES)[number]
  collectionId?: string
  salesChannelId?: string
  order: 'created_at' | '-created_at' | 'title' | '-title' | 'updated_at' | '-updated_at'
}

export type InventoryStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked'

export function inventoryStatus(s: { managed: number; available: number; low: boolean }): InventoryStatus {
  if (s.managed === 0) return 'not_tracked'
  if (s.available <= 0) return 'out_of_stock'
  if (s.low) return 'low_stock'
  return 'in_stock'
}

export async function listProducts(db: DbLike, q: ProductListQuery) {
  const p = t.product
  const filters: (SQL | undefined)[] = [isNull(p.deletedAt)]
  if (q.status) filters.push(eq(p.status, q.status))
  if (q.collectionId) filters.push(eq(p.collectionId, q.collectionId))
  if (q.salesChannelId) {
    filters.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(t.productSalesChannel)
          .where(and(eq(t.productSalesChannel.productId, p.id), eq(t.productSalesChannel.salesChannelId, q.salesChannelId))),
      ),
    )
  }
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, '\\$&')}%`
    filters.push(
      or(
        ilike(p.title, like),
        ilike(p.handle, like),
        exists(
          db
            .select({ x: sql`1` })
            .from(t.productVariant)
            .where(and(eq(t.productVariant.productId, p.id), isNull(t.productVariant.deletedAt), ilike(t.productVariant.sku, like))),
        ),
      ),
    )
  }
  const where = and(...filters)
  const orderCol = { created_at: p.createdAt, title: p.title, updated_at: p.updatedAt }[q.order.replace('-', '') as 'created_at' | 'title' | 'updated_at']
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        thumbnail: p.thumbnail,
        isGiftcard: p.isGiftcard,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        collectionId: p.collectionId,
        collectionTitle: t.productCollection.title,
      })
      .from(p)
      .leftJoin(t.productCollection, eq(t.productCollection.id, p.collectionId))
      .where(where)
      .orderBy(q.order.startsWith('-') ? desc(orderCol) : asc(orderCol), desc(p.id))
      .limit(q.limit)
      .offset(q.offset),
    db.select({ value: count() }).from(p).where(where),
  ])
  const ids = rows.map((r) => r.id)
  if (!ids.length) return { data: [], count: total?.value ?? 0 }

  const avail = db
    .select({
      itemId: t.inventoryLevel.inventoryItemId,
      available: sql<number>`sum(${t.inventoryLevel.stocked} - ${t.inventoryLevel.reserved})::int`.as('available'),
    })
    .from(t.inventoryLevel)
    .groupBy(t.inventoryLevel.inventoryItemId)
    .as('avail')
  const v = t.productVariant
  const [stock, channels] = await Promise.all([
    db
      .select({
        productId: v.productId,
        variants: sql<number>`count(*)::int`,
        managed: sql<number>`(count(*) filter (where ${v.manageInventory}))::int`,
        available: sql<number>`coalesce(sum(${avail.available}) filter (where ${v.manageInventory}), 0)::int`,
        low: sql<boolean>`coalesce(bool_or(${v.manageInventory} and coalesce(${avail.available}, 0) <= ${t.inventoryItem.lowStockThreshold}), false)`,
      })
      .from(v)
      .leftJoin(t.inventoryItem, eq(t.inventoryItem.variantId, v.id))
      .leftJoin(avail, eq(avail.itemId, t.inventoryItem.id))
      .where(and(inArray(v.productId, ids), isNull(v.deletedAt)))
      .groupBy(v.productId),
    db
      .select({ productId: t.productSalesChannel.productId, id: t.salesChannel.id, name: t.salesChannel.name })
      .from(t.productSalesChannel)
      .innerJoin(t.salesChannel, eq(t.salesChannel.id, t.productSalesChannel.salesChannelId))
      .where(inArray(t.productSalesChannel.productId, ids)),
  ])
  const data = rows.map((r) => {
    const s = stock.find((x) => x.productId === r.id) ?? { variants: 0, managed: 0, available: 0, low: false }
    return {
      ...r,
      variantCount: s.variants,
      inventory: { status: inventoryStatus(s), available: s.available, managedVariants: s.managed },
      salesChannels: channels.filter((c) => c.productId === r.id).map(({ id, name }) => ({ id, name })),
    }
  })
  return { data, count: total?.value ?? 0 }
}

// ── Detail ──────────────────────────────────────────────────────────────

export async function getProductDetail(db: DbLike, id: string) {
  const [product] = await db.select().from(t.product).where(and(eq(t.product.id, id), isNull(t.product.deletedAt)))
  if (!product) throw notFound('Product')

  const [options, variants, images, categories, tags, channels, collection, type] = await Promise.all([
    db.select().from(t.productOption).where(eq(t.productOption.productId, id)).orderBy(asc(t.productOption.rank)),
    db.select().from(t.productVariant).where(and(eq(t.productVariant.productId, id), isNull(t.productVariant.deletedAt))).orderBy(asc(t.productVariant.rank)),
    db.select().from(t.productImage).where(eq(t.productImage.productId, id)).orderBy(asc(t.productImage.rank)),
    db
      .select({ id: t.productCategory.id, name: t.productCategory.name, handle: t.productCategory.handle })
      .from(t.productCategoryProduct)
      .innerJoin(t.productCategory, eq(t.productCategory.id, t.productCategoryProduct.categoryId))
      .where(eq(t.productCategoryProduct.productId, id)),
    db
      .select({ id: t.productTag.id, value: t.productTag.value })
      .from(t.productTagLink)
      .innerJoin(t.productTag, eq(t.productTag.id, t.productTagLink.tagId))
      .where(eq(t.productTagLink.productId, id)),
    db
      .select({ id: t.salesChannel.id, name: t.salesChannel.name })
      .from(t.productSalesChannel)
      .innerJoin(t.salesChannel, eq(t.salesChannel.id, t.productSalesChannel.salesChannelId))
      .where(eq(t.productSalesChannel.productId, id)),
    product.collectionId ? db.select().from(t.productCollection).where(eq(t.productCollection.id, product.collectionId)) : Promise.resolve([]),
    product.typeId ? db.select().from(t.productType).where(eq(t.productType.id, product.typeId)) : Promise.resolve([]),
  ])
  const optionIds = options.map((o) => o.id)
  const variantIds = variants.map((v) => v.id)
  const [values, links, prices, items] = await Promise.all([
    optionIds.length ? db.select().from(t.productOptionValue).where(inArray(t.productOptionValue.optionId, optionIds)).orderBy(asc(t.productOptionValue.rank)) : Promise.resolve([]),
    variantIds.length ? db.select().from(t.variantOptionValue).where(inArray(t.variantOptionValue.variantId, variantIds)) : Promise.resolve([]),
    variantIds.length
      ? db
          .select({ variantId: t.priceSet.variantId, amount: t.price.amount, currencyCode: t.price.currencyCode, regionId: t.price.regionId, minQuantity: t.price.minQuantity, maxQuantity: t.price.maxQuantity, priceListId: t.price.priceListId })
          .from(t.price)
          .innerJoin(t.priceSet, eq(t.priceSet.id, t.price.priceSetId))
          .where(and(inArray(t.priceSet.variantId, variantIds), isNull(t.price.deletedAt)))
      : Promise.resolve([]),
    variantIds.length ? db.select().from(t.inventoryItem).where(inArray(t.inventoryItem.variantId, variantIds)) : Promise.resolve([]),
  ])
  const levels = items.length
    ? await db.select().from(t.inventoryLevel).where(inArray(t.inventoryLevel.inventoryItemId, items.map((i) => i.id)))
    : []

  const valueById = new Map(values.map((v) => [v.id, v]))
  const optionById = new Map(options.map((o) => [o.id, o]))
  return {
    ...product,
    collection: collection[0] ?? null,
    type: type[0] ?? null,
    images: images.map(({ id, url, alt, rank }) => ({ id, url, alt, rank })),
    categories,
    categoryIds: categories.map((c) => c.id),
    tags: tags.map((x) => x.value),
    salesChannels: channels,
    salesChannelIds: channels.map((c) => c.id),
    options: options.map((o) => ({ id: o.id, title: o.title, values: values.filter((v) => v.optionId === o.id).map((v) => v.value) })),
    variants: variants.map((v) => {
      const item = items.find((i) => i.variantId === v.id)
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
        barcode: v.barcode,
        manageInventory: v.manageInventory,
        allowBackorder: v.allowBackorder,
        weight: v.weight,
        options: opts,
        prices: prices.filter((p) => p.variantId === v.id && !p.priceListId).map(({ amount, currencyCode, regionId, minQuantity, maxQuantity }) => ({ amount, currencyCode, regionId, minQuantity, maxQuantity })),
        inventoryItemId: item?.id ?? null,
        lowStockThreshold: item?.lowStockThreshold ?? null,
        inventory: item ? levels.filter((l) => l.inventoryItemId === item.id).map((l) => ({ locationId: l.locationId, stocked: l.stocked, reserved: l.reserved, incoming: l.incoming })) : [],
      }
    }),
  }
}
export type ProductDetail = Awaited<ReturnType<typeof getProductDetail>>

// ── Save ────────────────────────────────────────────────────────────────

function combos(options: { values: string[] }[]): number[][] {
  return options.reduce<number[][]>((acc, o) => acc.flatMap((c) => o.values.map((_, i) => [...c, i])), [[]])
}

/** Fill in variants when the caller sends options but no variants (or nothing at all). */
function resolveVariants(input: ProductInputParsed): ProductInputParsed['variants'] {
  if (input.variants.length) return input.variants
  if (!input.options.length) return [{ title: 'Default', options: {}, prices: [], manageInventory: !input.isGiftcard, allowBackorder: false }]
  return combos(input.options).map((c) => ({
    options: Object.fromEntries(c.map((vi, oi) => [input.options[oi]!.title, input.options[oi]!.values[vi]!])),
    prices: [],
    manageInventory: !input.isGiftcard,
    allowBackorder: false,
  }))
}

/**
 * Create or fully replace a product. Options and option values are matched by title/value, variants
 * by id; anything missing from the input is removed (variants are soft-deleted so order history
 * keeps its references). Run inside a transaction.
 */
export async function saveProduct(tx: Tx, input: ProductInputParsed, id?: string): Promise<{ id: string; created: boolean }> {
  const handle = input.handle || toHandle(input.title) || `product-${Date.now()}`
  const [taken] = await tx
    .select({ id: t.product.id })
    .from(t.product)
    .where(and(eq(t.product.handle, handle), id ? ne(t.product.id, id) : undefined))
  if (taken) throw conflict(`The handle "${handle}" is already used by another product`, [{ path: 'handle', message: 'Handle is taken' }])

  const variants = resolveVariants(input)
  const skus = variants.map((v) => v.sku).filter((s): s is string => Boolean(s))
  if (skus.length) {
    const keepIds = variants.map((v) => v.id).filter((x): x is string => Boolean(x))
    const clash = await tx
      .select({ sku: t.productVariant.sku })
      .from(t.productVariant)
      .where(and(inArray(t.productVariant.sku, skus), isNull(t.productVariant.deletedAt), keepIds.length ? notInArray(t.productVariant.id, keepIds) : undefined))
    if (clash.length) throw conflict(`SKU already in use: ${clash.map((c) => c.sku).join(', ')}`, [{ path: 'variants', message: 'SKU already in use' }])
  }

  const fields = {
    title: input.title,
    subtitle: input.subtitle ?? null,
    handle,
    description: input.description ?? null,
    status: input.status,
    thumbnail: input.thumbnail || input.images[0]?.url || null,
    isGiftcard: input.isGiftcard,
    discountable: input.discountable,
    weight: input.weight ?? null,
    length: input.length ?? null,
    height: input.height ?? null,
    width: input.width ?? null,
    material: input.material ?? null,
    originCountry: input.originCountry || null,
    hsCode: input.hsCode ?? null,
    typeId: input.typeId || null,
    collectionId: input.collectionId || null,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
  }
  let productId = id
  if (productId) {
    const [row] = await tx.update(t.product).set(fields).where(and(eq(t.product.id, productId), isNull(t.product.deletedAt))).returning({ id: t.product.id })
    if (!row) throw notFound('Product')
  } else {
    const [profile] = await tx.select({ id: t.shippingProfile.id }).from(t.shippingProfile).where(eq(t.shippingProfile.type, input.isGiftcard ? 'gift_card' : 'default')).limit(1)
    const [row] = await tx.insert(t.product).values({ ...fields, shippingProfileId: profile?.id ?? null }).returning({ id: t.product.id })
    productId = row!.id
  }
  const pid = productId

  // Links: categories, tags, sales channels, images
  await tx.delete(t.productCategoryProduct).where(eq(t.productCategoryProduct.productId, pid))
  if (input.categoryIds.length) await tx.insert(t.productCategoryProduct).values([...new Set(input.categoryIds)].map((categoryId) => ({ categoryId, productId: pid })))

  await tx.delete(t.productTagLink).where(eq(t.productTagLink.productId, pid))
  const tagValues = [...new Set(input.tags.map((x) => x.toLowerCase()))]
  if (tagValues.length) {
    await tx.insert(t.productTag).values(tagValues.map((value) => ({ value }))).onConflictDoNothing({ target: t.productTag.value })
    const tagRows = await tx.select({ id: t.productTag.id }).from(t.productTag).where(inArray(t.productTag.value, tagValues))
    await tx.insert(t.productTagLink).values(tagRows.map((r) => ({ productId: pid, tagId: r.id })))
  }

  await tx.delete(t.productSalesChannel).where(eq(t.productSalesChannel.productId, pid))
  if (input.salesChannelIds.length) await tx.insert(t.productSalesChannel).values([...new Set(input.salesChannelIds)].map((salesChannelId) => ({ productId: pid, salesChannelId })))

  await tx.delete(t.productImage).where(eq(t.productImage.productId, pid))
  if (input.images.length) await tx.insert(t.productImage).values(input.images.map((img, rank) => ({ productId: pid, url: img.url, alt: img.alt ?? null, rank })))

  // Options and values (matched by title, case-insensitive)
  const existingOptions = await tx.select().from(t.productOption).where(eq(t.productOption.productId, pid))
  const valueIdByKey = new Map<string, string>() // `${optionTitle}\0${value}` → optionValueId
  const keptOptionIds: string[] = []
  for (const [rank, o] of input.options.entries()) {
    let opt = existingOptions.find((e) => e.title.toLowerCase() === o.title.toLowerCase())
    if (opt) await tx.update(t.productOption).set({ title: o.title, rank }).where(eq(t.productOption.id, opt.id))
    else opt = (await tx.insert(t.productOption).values({ productId: pid, title: o.title, rank }).returning())[0]!
    keptOptionIds.push(opt.id)
    const existingValues = await tx.select().from(t.productOptionValue).where(eq(t.productOptionValue.optionId, opt.id))
    const keptValueIds: string[] = []
    for (const [vrank, value] of o.values.entries()) {
      let val = existingValues.find((e) => e.value.toLowerCase() === value.toLowerCase())
      if (val) await tx.update(t.productOptionValue).set({ value, rank: vrank }).where(eq(t.productOptionValue.id, val.id))
      else val = (await tx.insert(t.productOptionValue).values({ optionId: opt.id, value, rank: vrank }).returning())[0]!
      keptValueIds.push(val.id)
      valueIdByKey.set(`${o.title}\u0000${value}`, val.id)
    }
    const dropValues = existingValues.filter((e) => !keptValueIds.includes(e.id)).map((e) => e.id)
    if (dropValues.length) await tx.delete(t.productOptionValue).where(inArray(t.productOptionValue.id, dropValues))
  }
  const dropOptions = existingOptions.filter((e) => !keptOptionIds.includes(e.id)).map((e) => e.id)
  if (dropOptions.length) await tx.delete(t.productOption).where(inArray(t.productOption.id, dropOptions))

  // Variants
  const existingVariants = await tx.select().from(t.productVariant).where(and(eq(t.productVariant.productId, pid), isNull(t.productVariant.deletedAt)))
  const keptVariantIds: string[] = []
  for (const [rank, v] of variants.entries()) {
    const title = v.title || input.options.map((o) => v.options[o.title]).join(' / ') || 'Default'
    const vf = { title, sku: v.sku || null, barcode: v.barcode || null, manageInventory: v.manageInventory, allowBackorder: v.allowBackorder, weight: v.weight ?? null, rank }
    const existing = v.id ? existingVariants.find((e) => e.id === v.id) : undefined
    const variantId = existing
      ? (await tx.update(t.productVariant).set(vf).where(eq(t.productVariant.id, existing.id)).returning({ id: t.productVariant.id }))[0]!.id
      : (await tx.insert(t.productVariant).values({ ...vf, productId: pid }).returning({ id: t.productVariant.id }))[0]!.id
    keptVariantIds.push(variantId)

    await tx.delete(t.variantOptionValue).where(eq(t.variantOptionValue.variantId, variantId))
    const valueIds = input.options.map((o) => valueIdByKey.get(`${o.title}\u0000${v.options[o.title]}`)).filter((x): x is string => Boolean(x))
    if (valueIds.length) await tx.insert(t.variantOptionValue).values(valueIds.map((optionValueId) => ({ variantId, optionValueId })))

    // Base prices (price-list prices are managed separately)
    const [set] = await tx.insert(t.priceSet).values({ variantId }).onConflictDoUpdate({ target: t.priceSet.variantId, set: { updatedAt: new Date() } }).returning({ id: t.priceSet.id })
    await tx.delete(t.price).where(and(eq(t.price.priceSetId, set!.id), isNull(t.price.priceListId)))
    if (v.prices.length) {
      await tx.insert(t.price).values(
        v.prices.map((p) => ({ priceSetId: set!.id, amount: p.amount, currencyCode: p.currencyCode, regionId: p.regionId || null, minQuantity: p.minQuantity ?? null, maxQuantity: p.maxQuantity ?? null })),
      )
    }

    // Inventory
    if (v.manageInventory) {
      const [item] = await tx
        .insert(t.inventoryItem)
        .values({ variantId, sku: vf.sku })
        .onConflictDoUpdate({ target: t.inventoryItem.variantId, set: { sku: vf.sku } })
        .returning({ id: t.inventoryItem.id })
      for (const lvl of v.inventory ?? []) {
        await tx
          .insert(t.inventoryLevel)
          .values({ inventoryItemId: item!.id, locationId: lvl.locationId, stocked: lvl.stocked })
          .onConflictDoUpdate({ target: [t.inventoryLevel.inventoryItemId, t.inventoryLevel.locationId], set: { stocked: lvl.stocked } })
      }
    }
  }
  const dropVariants = existingVariants.filter((e) => !keptVariantIds.includes(e.id)).map((e) => e.id)
  if (dropVariants.length) {
    // Free the SKU for reuse; keep the row for order history.
    await tx.update(t.productVariant).set({ deletedAt: new Date(), sku: null }).where(inArray(t.productVariant.id, dropVariants))
  }

  return { id: pid, created: !id }
}

export async function deleteProduct(tx: Tx, id: string) {
  const [row] = await tx
    .update(t.product)
    .set({ deletedAt: new Date(), handle: sql`${t.product.handle} || '-deleted-' || ${t.product.id}` })
    .where(and(eq(t.product.id, id), isNull(t.product.deletedAt)))
    .returning({ id: t.product.id })
  if (!row) throw notFound('Product')
  await tx.update(t.productVariant).set({ deletedAt: new Date(), sku: null }).where(eq(t.productVariant.productId, id))
}
