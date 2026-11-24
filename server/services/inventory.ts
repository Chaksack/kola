/**
 * Inventory: stock levels, adjustments and reservations. Every quantity change is a single
 * conditional UPDATE, so it is atomic without an interactive transaction (works on neon-http).
 */
import { and, asc, count, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import * as t from '../db/schema'
import { apiError, notFound } from './errors'

export interface InventoryListQuery {
  limit: number
  offset: number
  q?: string
  locationId?: string
  status?: 'low_stock' | 'out_of_stock' | 'in_stock'
}

export async function listInventory(db: DbLike, query: InventoryListQuery) {
  const v = t.productVariant
  const levelAgg = db
    .select({
      itemId: t.inventoryLevel.inventoryItemId,
      stocked: sql<number>`sum(${t.inventoryLevel.stocked})::int`.as('stocked'),
      reserved: sql<number>`sum(${t.inventoryLevel.reserved})::int`.as('reserved'),
      incoming: sql<number>`sum(${t.inventoryLevel.incoming})::int`.as('incoming'),
    })
    .from(t.inventoryLevel)
    .where(query.locationId ? eq(t.inventoryLevel.locationId, query.locationId) : undefined)
    .groupBy(t.inventoryLevel.inventoryItemId)
    .as('lv')
  const available = sql<number>`(coalesce(${levelAgg.stocked}, 0) - coalesce(${levelAgg.reserved}, 0))`
  const filters: (SQL | undefined)[] = [isNull(v.deletedAt), isNull(t.product.deletedAt), eq(v.manageInventory, true)]
  if (query.q) {
    const like = `%${query.q}%`
    filters.push(or(ilike(t.product.title, like), ilike(v.sku, like), ilike(v.title, like)))
  }
  if (query.status === 'out_of_stock') filters.push(sql`${available} <= 0`)
  if (query.status === 'low_stock') filters.push(sql`${available} > 0 and ${available} <= ${t.inventoryItem.lowStockThreshold}`)
  if (query.status === 'in_stock') filters.push(sql`${available} > ${t.inventoryItem.lowStockThreshold}`)
  const where = and(...filters)

  const base = () =>
    db
      .select({
        id: t.inventoryItem.id,
        sku: t.inventoryItem.sku,
        lowStockThreshold: t.inventoryItem.lowStockThreshold,
        variantId: v.id,
        variantTitle: v.title,
        productId: t.product.id,
        productTitle: t.product.title,
        productHandle: t.product.handle,
        thumbnail: t.product.thumbnail,
        stocked: sql<number>`coalesce(${levelAgg.stocked}, 0)::int`,
        reserved: sql<number>`coalesce(${levelAgg.reserved}, 0)::int`,
        incoming: sql<number>`coalesce(${levelAgg.incoming}, 0)::int`,
        available: sql<number>`${available}::int`,
      })
      .from(t.inventoryItem)
      .innerJoin(v, eq(v.id, t.inventoryItem.variantId))
      .innerJoin(t.product, eq(t.product.id, v.productId))
      .leftJoin(levelAgg, eq(levelAgg.itemId, t.inventoryItem.id))
      .where(where)

  const [rows, [total]] = await Promise.all([
    base().orderBy(asc(t.product.title), asc(v.rank)).limit(query.limit).offset(query.offset),
    db
      .select({ value: count() })
      .from(t.inventoryItem)
      .innerJoin(v, eq(v.id, t.inventoryItem.variantId))
      .innerJoin(t.product, eq(t.product.id, v.productId))
      .leftJoin(levelAgg, eq(levelAgg.itemId, t.inventoryItem.id))
      .where(where),
  ])
  const ids = rows.map((r) => r.id)
  const levels = ids.length
    ? await db
        .select({ itemId: t.inventoryLevel.inventoryItemId, locationId: t.inventoryLevel.locationId, stocked: t.inventoryLevel.stocked, reserved: t.inventoryLevel.reserved, incoming: t.inventoryLevel.incoming })
        .from(t.inventoryLevel)
        .where(inArray(t.inventoryLevel.inventoryItemId, ids))
    : []
  return {
    data: rows.map((r) => ({
      ...r,
      status: r.available <= 0 ? 'out_of_stock' : r.available <= r.lowStockThreshold ? 'low_stock' : 'in_stock',
      levels: levels.filter((l) => l.itemId === r.id).map(({ itemId: _i, ...l }) => ({ ...l, available: l.stocked - l.reserved })),
    })),
    count: total?.value ?? 0,
  }
}

export interface LevelUpdate {
  locationId: string
  /** Set stocked to an absolute value… */
  stocked?: number
  /** …or adjust it by a delta (e.g. +12 received, −1 damaged). */
  adjustment?: number
  incoming?: number
}

/**
 * Set or adjust a level. Stocked can never drop below what is already reserved, so committed
 * orders always stay fulfillable.
 */
export async function updateLevel(db: DbLike, inventoryItemId: string, u: LevelUpdate) {
  const [item] = await db.select({ id: t.inventoryItem.id }).from(t.inventoryItem).where(eq(t.inventoryItem.id, inventoryItemId))
  if (!item) throw notFound('Inventory item')
  await db.insert(t.inventoryLevel).values({ inventoryItemId, locationId: u.locationId }).onConflictDoNothing()
  const stocked =
    u.stocked !== undefined ? sql`${u.stocked}` : u.adjustment !== undefined ? sql`${t.inventoryLevel.stocked} + ${u.adjustment}` : sql`${t.inventoryLevel.stocked}`
  const [row] = await db
    .update(t.inventoryLevel)
    .set({ stocked, ...(u.incoming !== undefined ? { incoming: u.incoming } : {}) })
    .where(and(eq(t.inventoryLevel.inventoryItemId, inventoryItemId), eq(t.inventoryLevel.locationId, u.locationId), sql`${stocked} >= ${t.inventoryLevel.reserved}`))
    .returning()
  if (!row) throw apiError(409, 'insufficient_stock', 'Stocked quantity cannot be lower than the quantity already reserved for orders')
  return row
}

/**
 * Reserve `quantity` at a location if enough is available. Returns false (and changes nothing)
 * when there isn't. A single UPDATE … WHERE stocked − reserved ≥ qty, so concurrent checkouts can't
 * oversell.
 */
export async function tryReserveAt(db: DbLike, inventoryItemId: string, locationId: string, quantity: number, allowBackorder = false): Promise<boolean> {
  const rows = await db
    .update(t.inventoryLevel)
    .set({ reserved: sql`${t.inventoryLevel.reserved} + ${quantity}` })
    .where(
      and(
        eq(t.inventoryLevel.inventoryItemId, inventoryItemId),
        eq(t.inventoryLevel.locationId, locationId),
        allowBackorder ? undefined : sql`${t.inventoryLevel.stocked} - ${t.inventoryLevel.reserved} >= ${quantity}`,
      ),
    )
    .returning({ id: t.inventoryLevel.id })
  return rows.length > 0
}

/** Pick a location that can cover the whole quantity: the preferred one first, then by most available. */
export async function reserveAnywhere(db: DbLike, inventoryItemId: string, quantity: number, preferredLocationId?: string | null, allowBackorder = false): Promise<string | null> {
  const levels = await db
    .select({ locationId: t.inventoryLevel.locationId, available: sql<number>`${t.inventoryLevel.stocked} - ${t.inventoryLevel.reserved}` })
    .from(t.inventoryLevel)
    .where(eq(t.inventoryLevel.inventoryItemId, inventoryItemId))
  const ordered = [...levels].sort((a, b) => (a.locationId === preferredLocationId ? -1 : b.locationId === preferredLocationId ? 1 : b.available - a.available))
  for (const l of ordered) {
    if (await tryReserveAt(db, inventoryItemId, l.locationId, quantity)) return l.locationId
  }
  if (allowBackorder && ordered[0] && (await tryReserveAt(db, inventoryItemId, ordered[0].locationId, quantity, true))) return ordered[0].locationId
  return null
}

export async function releaseAt(db: DbLike, inventoryItemId: string, locationId: string, quantity: number) {
  await db
    .update(t.inventoryLevel)
    .set({ reserved: sql`greatest(${t.inventoryLevel.reserved} - ${quantity}, 0)` })
    .where(and(eq(t.inventoryLevel.inventoryItemId, inventoryItemId), eq(t.inventoryLevel.locationId, locationId)))
}

/** Ship reserved stock: reserved and stocked both go down. */
export async function consumeReservedAt(db: DbLike, inventoryItemId: string, locationId: string, quantity: number) {
  await db
    .update(t.inventoryLevel)
    .set({
      reserved: sql`greatest(${t.inventoryLevel.reserved} - ${quantity}, 0)`,
      stocked: sql`greatest(${t.inventoryLevel.stocked} - ${quantity}, 0)`,
    })
    .where(and(eq(t.inventoryLevel.inventoryItemId, inventoryItemId), eq(t.inventoryLevel.locationId, locationId)))
}

/** Returned goods go back on the shelf. */
export async function restockAt(db: DbLike, inventoryItemId: string, locationId: string, quantity: number) {
  await db.insert(t.inventoryLevel).values({ inventoryItemId, locationId }).onConflictDoNothing()
  await db
    .update(t.inventoryLevel)
    .set({ stocked: sql`${t.inventoryLevel.stocked} + ${quantity}` })
    .where(and(eq(t.inventoryLevel.inventoryItemId, inventoryItemId), eq(t.inventoryLevel.locationId, locationId)))
}
