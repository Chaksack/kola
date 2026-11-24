import { and, eq, sql } from 'drizzle-orm'
import * as t from '../../server/db/schema'
import { Client } from './client'
import { db, publishableKey, uniqueEmail } from './helpers'

const address = { firstName: 'Kojo', lastName: 'Test', address1: '3 Oxford Street', city: 'Accra', countryCode: 'GH', phone: '+233200000001' }

/** Place a cash-on-delivery order through the store API and return its id. */
export async function placeOrder(lines: { handle: string; variant?: number; quantity: number }[]): Promise<{ id: string; displayId: number }> {
  const c = new Client({ 'x-publishable-api-key': await publishableKey() })
  const cart = (await c.post<{ cart: { id: string } }>('/api/store/carts', {})).body.cart
  for (const l of lines) {
    const p = (await c.get<{ product: { variants: { id: string }[] } }>(`/api/store/products/${l.handle}`)).body.product
    const res = await c.post(`/api/store/carts/${cart.id}/line-items`, { variantId: p.variants[l.variant ?? 0]!.id, quantity: l.quantity })
    if (res.status !== 200) throw new Error(`add failed: ${JSON.stringify(res.body)}`)
  }
  await c.post(`/api/store/carts/${cart.id}`, { email: uniqueEmail('order'), shippingAddress: address })
  const options = await c.get<{ data: { id: string; name: string }[] }>(`/api/store/carts/${cart.id}/shipping-options`)
  await c.post(`/api/store/carts/${cart.id}/shipping-methods`, { optionId: options.body.data.find((o) => o.name === 'Standard delivery')!.id })
  await c.post(`/api/store/carts/${cart.id}/payment-sessions`, { providerId: 'manual' })
  const done = await c.post<{ order: { id: string; displayId: number } }>(`/api/store/carts/${cart.id}/complete`)
  if (done.status !== 200) throw new Error(`complete failed: ${JSON.stringify(done.body)}`)
  return done.body.order
}

export async function levelsFor(variantId: string) {
  const [row] = await db()
    .select({ stocked: sql<number>`sum(${t.inventoryLevel.stocked})::int`, reserved: sql<number>`sum(${t.inventoryLevel.reserved})::int` })
    .from(t.inventoryLevel)
    .innerJoin(t.inventoryItem, and(eq(t.inventoryItem.id, t.inventoryLevel.inventoryItemId), eq(t.inventoryItem.variantId, variantId)))
  return row!
}
