/**
 * CSV import/export, chunked so every request stays well inside serverless time limits:
 * exports return one page of rows plus `nextOffset`; imports receive at most 50 products per call
 * (the browser groups rows by handle and sends chunks in sequence).
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DbLike, Tx } from '../db/client'
import * as t from '../db/schema'
import { fromMinor, toMinor } from '../../shared/utils/money'
import { stringifyCsv } from '../../shared/utils/csv'
import { productInputSchema, toHandle, type ProductInputParsed } from '../../shared/schemas/catalog'
import { saveProduct } from './product'

const OPTION_SLOTS = [1, 2, 3] as const

export function productCsvHeader(currencies: string[]) {
  return ['handle', 'title', 'subtitle', 'description', 'status', 'collection', 'type', 'tags', ...OPTION_SLOTS.flatMap((n) => [`option${n}_name`, `option${n}_value`]), 'sku', 'barcode', 'manage_inventory', ...currencies.map((c) => `price_${c.toLowerCase()}`), 'stock']
}

export async function exportProductsChunk(db: DbLike, offset: number, limit: number, currencies: string[]) {
  const products = await db
    .select({ p: t.product, collection: t.productCollection.handle, type: t.productType.value })
    .from(t.product)
    .leftJoin(t.productCollection, eq(t.productCollection.id, t.product.collectionId))
    .leftJoin(t.productType, eq(t.productType.id, t.product.typeId))
    .where(isNull(t.product.deletedAt))
    .orderBy(asc(t.product.createdAt), asc(t.product.id))
    .limit(limit)
    .offset(offset)
  const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(t.product).where(isNull(t.product.deletedAt))
  const ids = products.map((r) => r.p.id)
  if (!ids.length) return { csv: offset === 0 ? stringifyCsv([productCsvHeader(currencies)]) : '', nextOffset: null, total }
  const [variants, tags, options, values, links, prices, stock] = await Promise.all([
    db.select().from(t.productVariant).where(and(inArray(t.productVariant.productId, ids), isNull(t.productVariant.deletedAt))).orderBy(asc(t.productVariant.rank)),
    db.select({ productId: t.productTagLink.productId, value: t.productTag.value }).from(t.productTagLink).innerJoin(t.productTag, eq(t.productTag.id, t.productTagLink.tagId)).where(inArray(t.productTagLink.productId, ids)),
    db.select().from(t.productOption).where(inArray(t.productOption.productId, ids)).orderBy(asc(t.productOption.rank)),
    db.select({ id: t.productOptionValue.id, optionId: t.productOptionValue.optionId, value: t.productOptionValue.value }).from(t.productOptionValue).innerJoin(t.productOption, eq(t.productOption.id, t.productOptionValue.optionId)).where(inArray(t.productOption.productId, ids)),
    db.select({ variantId: t.variantOptionValue.variantId, optionValueId: t.variantOptionValue.optionValueId }).from(t.variantOptionValue).innerJoin(t.productVariant, eq(t.productVariant.id, t.variantOptionValue.variantId)).where(inArray(t.productVariant.productId, ids)),
    db.select({ variantId: t.priceSet.variantId, amount: t.price.amount, currencyCode: t.price.currencyCode }).from(t.price).innerJoin(t.priceSet, eq(t.priceSet.id, t.price.priceSetId)).innerJoin(t.productVariant, eq(t.productVariant.id, t.priceSet.variantId)).where(and(inArray(t.productVariant.productId, ids), isNull(t.price.priceListId), isNull(t.price.regionId), isNull(t.price.deletedAt))),
    db.select({ variantId: t.inventoryItem.variantId, stocked: sql<number>`coalesce(sum(${t.inventoryLevel.stocked}), 0)::int` }).from(t.inventoryItem).leftJoin(t.inventoryLevel, eq(t.inventoryLevel.inventoryItemId, t.inventoryItem.id)).innerJoin(t.productVariant, eq(t.productVariant.id, t.inventoryItem.variantId)).where(inArray(t.productVariant.productId, ids)).groupBy(t.inventoryItem.variantId),
  ])
  const rows: unknown[][] = offset === 0 ? [productCsvHeader(currencies)] : []
  for (const { p, collection, type } of products) {
    const opts = options.filter((o) => o.productId === p.id)
    for (const [vi, v] of variants.filter((x) => x.productId === p.id).entries()) {
      const vValues = links.filter((l) => l.variantId === v.id).map((l) => values.find((x) => x.id === l.optionValueId)).filter(Boolean)
      const optionCells = OPTION_SLOTS.flatMap((n) => {
        const o = opts[n - 1]
        return o ? [o.title, vValues.find((x) => x!.optionId === o.id)?.value ?? ''] : ['', '']
      })
      // Product-level columns only on the first row of each product, like most commerce exports.
      const first = vi === 0
      rows.push([
        p.handle,
        first ? p.title : '',
        first ? p.subtitle : '',
        first ? p.description : '',
        first ? p.status : '',
        first ? collection : '',
        first ? type : '',
        first ? tags.filter((x) => x.productId === p.id).map((x) => x.value).join(', ') : '',
        ...optionCells,
        v.sku,
        v.barcode,
        v.manageInventory ? 'true' : 'false',
        ...currencies.map((c) => {
          const pr = prices.find((x) => x.variantId === v.id && x.currencyCode === c)
          return pr ? fromMinor(pr.amount, c) : ''
        }),
        v.manageInventory ? (stock.find((s) => s.variantId === v.id)?.stocked ?? 0) : '',
      ])
    }
  }
  const next = offset + products.length
  return { csv: stringifyCsv(rows), nextOffset: next < total ? next : null, total }
}

export async function exportOrdersChunk(db: DbLike, offset: number, limit: number) {
  const rows = await db
    .select({ o: t.order, firstName: t.customer.firstName, lastName: t.customer.lastName, channel: t.salesChannel.name })
    .from(t.order)
    .leftJoin(t.customer, eq(t.customer.id, t.order.customerId))
    .leftJoin(t.salesChannel, eq(t.salesChannel.id, t.order.salesChannelId))
    .where(and(isNull(t.order.deletedAt), eq(t.order.isDraft, false)))
    .orderBy(desc(t.order.createdAt), desc(t.order.id))
    .limit(limit)
    .offset(offset)
  const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(t.order).where(and(isNull(t.order.deletedAt), eq(t.order.isDraft, false)))
  const ids = rows.map((r) => r.o.id)
  const counts = ids.length ? await db.select({ orderId: t.orderItem.orderId, n: sql<number>`sum(${t.orderItem.quantity})::int` }).from(t.orderItem).where(inArray(t.orderItem.orderId, ids)).groupBy(t.orderItem.orderId) : []
  const header = ['order', 'created_at', 'email', 'customer', 'status', 'payment_status', 'fulfillment_status', 'sales_channel', 'country', 'currency', 'items', 'subtotal', 'discount', 'shipping', 'tax', 'total', 'refunded', 'promo_codes']
  const out: unknown[][] = offset === 0 ? [header] : []
  for (const { o, firstName, lastName, channel } of rows) {
    const m = (n: number) => fromMinor(n, o.currencyCode)
    out.push([o.displayId, o.createdAt.toISOString(), o.email, [firstName, lastName].filter(Boolean).join(' '), o.status, o.paymentStatus, o.fulfillmentStatus, channel, o.shippingAddress?.countryCode?.toUpperCase() ?? '', o.currencyCode, counts.find((c) => c.orderId === o.id)?.n ?? 0, m(o.itemSubtotal), m(o.discountTotal), m(o.shippingTotal), m(o.taxTotal), m(o.total), m(o.refundedTotal), o.promoCodes.join(' ')])
  }
  const next = offset + rows.length
  return { csv: stringifyCsv(out), nextOffset: next < total ? next : null, total }
}

export interface ImportResult {
  handle: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  message?: string
}

/** Turn the CSV rows of one product (same handle) into the product editor's input shape. */
export async function rowsToProductInput(db: DbLike, rows: Record<string, string>[], currencies: string[], existingId: string | null): Promise<ProductInputParsed> {
  const head = rows[0]!
  const optionTitles = OPTION_SLOTS.map((n) => head[`option${n}_name`]).filter((x): x is string => Boolean(x))
  const options = optionTitles.map((title, i) => ({ title, values: [...new Set(rows.map((r) => r[`option${i + 1}_value`]).filter((x): x is string => Boolean(x)))] }))
  const [collection] = head.collection ? await db.select({ id: t.productCollection.id }).from(t.productCollection).where(eq(t.productCollection.handle, head.collection)) : []
  let typeId: string | null = null
  if (head.type) {
    const [ty] = await db.insert(t.productType).values({ value: head.type }).onConflictDoUpdate({ target: t.productType.value, set: { deletedAt: null } }).returning({ id: t.productType.id })
    typeId = ty!.id
  }
  const existingVariants = existingId ? await db.select({ id: t.productVariant.id, sku: t.productVariant.sku }).from(t.productVariant).where(and(eq(t.productVariant.productId, existingId), isNull(t.productVariant.deletedAt))) : []
  const [loc] = await db.select({ id: t.store.defaultLocationId }).from(t.store).limit(1)
  const input = {
    title: head.title || head.handle!,
    subtitle: head.subtitle || null,
    handle: toHandle(head.handle!),
    description: head.description || null,
    status: (['draft', 'proposed', 'published', 'rejected'].includes(head.status ?? '') ? head.status : 'draft') as 'draft',
    collectionId: collection?.id ?? null,
    typeId,
    tags: (head.tags ?? '').split(',').map((x) => x.trim()).filter(Boolean),
    options,
    variants: rows.map((r) => {
      const manage = (r.manage_inventory ?? 'true').toLowerCase() !== 'false'
      return {
        id: existingVariants.find((v) => v.sku && v.sku === r.sku)?.id,
        sku: r.sku || null,
        barcode: r.barcode || null,
        manageInventory: manage,
        allowBackorder: false,
        options: Object.fromEntries(optionTitles.map((title, i) => [title, r[`option${i + 1}_value`] ?? ''])),
        prices: currencies.filter((c) => r[`price_${c.toLowerCase()}`]).map((c) => ({ amount: toMinor(r[`price_${c.toLowerCase()}`]!, c), currencyCode: c })),
        inventory: manage && r.stock !== undefined && r.stock !== '' && loc?.id ? [{ locationId: loc.id, stocked: Math.max(0, Math.floor(Number(r.stock) || 0)) }] : undefined,
      }
    }),
  }
  return productInputSchema.parse(input)
}

export async function importProductGroup(db: DbLike, withTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>, rows: Record<string, string>[], currencies: string[], dryRun: boolean): Promise<ImportResult> {
  const handle = toHandle(rows[0]?.handle ?? '')
  if (!handle) return { handle: rows[0]?.handle ?? '', action: 'error', message: 'Missing handle' }
  try {
    const [existing] = await db.select({ id: t.product.id }).from(t.product).where(and(eq(t.product.handle, handle), isNull(t.product.deletedAt)))
    const input = await rowsToProductInput(db, rows, currencies, existing?.id ?? null)
    if (dryRun) return { handle, action: existing ? 'updated' : 'created', message: `${input.variants.length} variant(s)` }
    await withTx((tx) => saveProduct(tx, input, existing?.id))
    return { handle, action: existing ? 'updated' : 'created', message: `${input.variants.length} variant(s)` }
  } catch (err) {
    const issues = (err as { issues?: { path: (string | number)[]; message: string }[] }).issues
    return { handle, action: 'error', message: issues ? issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : err instanceof Error ? err.message : 'Failed' }
  }
}
