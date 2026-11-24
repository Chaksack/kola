import type { H3Event } from 'h3'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { region, store } from '../db/schema'
import type { StoreScope } from '../services/storefront'
import { customerGroupIds, loadCart, type CartRow } from '../services/cart'

/** The store's default region id (null when the store isn't set up). */
export async function defaultRegionId(): Promise<string | null> {
  const db = useDb()
  const [s] = await db.select({ id: store.defaultRegionId }).from(store).where(isNull(store.deletedAt)).limit(1)
  if (s?.id) return s.id
  const [first] = await db.select({ id: region.id }).from(region).where(isNull(region.deletedAt)).orderBy(asc(region.createdAt)).limit(1)
  return first?.id ?? null
}

export async function resolveRegion(regionId?: string | null) {
  const id = regionId || (await defaultRegionId())
  if (!id) throw apiError(503, 'store_not_configured', 'The store has no regions yet')
  const [row] = await useDb().select().from(region).where(and(eq(region.id, id), isNull(region.deletedAt)))
  if (!row) throw apiError(400, 'invalid_region', 'Unknown region')
  return row
}

/** Publishable-key channels + region + the signed-in customer's groups (for price lists). */
export async function storeScope(event: H3Event, regionId?: string | null): Promise<StoreScope> {
  const { salesChannelIds } = await requirePublishableKey(event)
  const r = await resolveRegion(regionId)
  const customer = await getCustomer(event)
  return { salesChannelIds, regionId: r.id, currencyCode: r.currencyCode, customerGroupIds: await customerGroupIds(useDb(), customer?.id ?? null) }
}

/** Load a cart the caller may use: it must belong to one of the key's sales channels. */
export async function storeCart(event: H3Event, id: string): Promise<CartRow> {
  const { salesChannelIds } = await requirePublishableKey(event)
  const cart = await loadCart(useDb(), id)
  if (!salesChannelIds.includes(cart.salesChannelId)) throw notFound('Cart')
  // A cart owned by a customer can't be used by someone else's session.
  if (cart.customerId) {
    const customer = await getCustomer(event)
    if (customer && customer.id !== cart.customerId) throw notFound('Cart')
  }
  return cart
}
