import { describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import * as t from '../../server/db/schema'
import { Client, hasServer } from './client'
import { adminClient, db, publishableKey, uniqueEmail } from './helpers'

interface Cart {
  id: string
  items: { id: string }[]
  shippingMethods: { name: string; amount: number }[]
  totals: { total: number; shippingTotal: number }
}
interface Order {
  id: string
  displayId: number
  paymentStatus: string
  fulfillmentStatus: string
  email: string
  totals: { total: number; discountTotal: number }
  items: { title: string; quantity: number }[]
}

const address = { firstName: 'Akosua', lastName: 'Mensah', address1: '5 Cantonments Road', city: 'Accra', countryCode: 'GH', phone: '+233200000000' }

async function store() {
  return new Client({ 'x-publishable-api-key': await publishableKey() })
}

async function readyCart(c: Client, variantId: string, qty = 1, email = uniqueEmail('guest')) {
  const cart = (await c.post<{ cart: Cart }>('/api/store/carts', {})).body.cart
  const added = await c.post<{ cart: Cart }>(`/api/store/carts/${cart.id}/line-items`, { variantId, quantity: qty })
  if (added.status !== 200) throw new Error(`add failed ${added.status} ${JSON.stringify(added.body)}`)
  await c.post(`/api/store/carts/${cart.id}`, { email, shippingAddress: address })
  const options = await c.get<{ data: { id: string; name: string; amount: number }[] }>(`/api/store/carts/${cart.id}/shipping-options`)
  const standard = options.body.data.find((o) => o.name === 'Standard delivery')!
  await c.post(`/api/store/carts/${cart.id}/shipping-methods`, { optionId: standard.id })
  return { cartId: cart.id, email }
}

async function variantOf(c: Client, handle: string, index = 0) {
  return (await c.get<{ product: { variants: { id: string }[] } }>(`/api/store/products/${handle}`)).body.product.variants[index]!.id
}

describe.skipIf(!hasServer)('checkout', () => {
  it('lists shipping options for the address and adds the method to totals', async () => {
    const c = await store()
    const variantId = await variantOf(c, 'shea-body-butter-250ml')
    const { cartId } = await readyCart(c, variantId)
    const cart = (await c.get<{ cart: Cart }>(`/api/store/carts/${cartId}`)).body.cart
    expect(cart.shippingMethods).toEqual([expect.objectContaining({ name: 'Standard delivery', amount: 3000 })])
    expect(cart.totals.total).toBe(12000 + 3000)
    const options = await c.get<{ data: { name: string }[] }>(`/api/store/carts/${cartId}/shipping-options`)
    // Return and admin-only options are never offered
    expect(options.body.data.map((o) => o.name)).not.toContain('Return to Tema warehouse')
  })

  it('guest checkout with cash on delivery: idempotent, reserves stock, counts promo usage', async () => {
    const c = await store()
    const variantId = await variantOf(c, 'single-origin-cocoa-nibs', 1)
    const { cartId, email } = await readyCart(c, variantId, 2)
    await c.post(`/api/store/carts/${cartId}/promotions`, { code: 'HARMATTAN10' })
    const [promoBefore] = await db().select({ n: t.promotion.usageCount }).from(t.promotion).where(eq(t.promotion.code, 'HARMATTAN10'))
    const reservedBefore = await reservedFor(variantId)

    const incomplete = await c.post(`/api/store/carts/${cartId}/complete`)
    expect(incomplete.status).toBe(400)
    expect(incomplete.body).toMatchObject({ code: 'payment_required' })

    const session = await c.post<{ session: { providerId: string } }>(`/api/store/carts/${cartId}/payment-sessions`, { providerId: 'manual' })
    expect(session.status).toBe(200)

    const key = `test-${cartId}`
    const first = await c.post<{ type: string; order: Order }>(`/api/store/carts/${cartId}/complete`, {}, { 'idempotency-key': key })
    expect(first.status).toBe(200)
    expect(first.body.type).toBe('order')
    const order = first.body.order
    expect(order).toMatchObject({ paymentStatus: 'awaiting', fulfillmentStatus: 'not_fulfilled', email })
    expect(order.totals.discountTotal).toBe(3400)

    const retry = await c.post<{ order: Order }>(`/api/store/carts/${cartId}/complete`, {}, { 'idempotency-key': key })
    expect(retry.body.order.id).toBe(order.id)
    const again = await c.post<{ order: Order }>(`/api/store/carts/${cartId}/complete`)
    expect(again.body.order.id).toBe(order.id)

    expect(await reservedFor(variantId)).toBe(reservedBefore + 2)
    const [promoAfter] = await db().select({ n: t.promotion.usageCount }).from(t.promotion).where(eq(t.promotion.code, 'HARMATTAN10'))
    expect(promoAfter!.n).toBe(promoBefore!.n + 1)

    // The cart is closed
    expect((await c.post(`/api/store/carts/${cartId}/line-items`, { variantId, quantity: 1 })).status).toBe(409)
    // Order lookup needs the right email
    expect((await c.get(`/api/store/orders/${order.id}?email=${encodeURIComponent(email)}`)).status).toBe(200)
    expect((await c.get(`/api/store/orders/${order.id}?email=someone@else.com`)).status).toBe(404)
    const byNumber = await c.post<{ order: Order }>('/api/store/orders/lookup', { displayId: order.displayId, email })
    expect(byNumber.body.order.id).toBe(order.id)
    // Guests become customers without an account
    const [cus] = await db().select().from(t.customer).where(eq(t.customer.email, email))
    expect(cus?.hasAccount).toBe(false)
  })

  it('rejects a payment session that no longer matches the cart total', async () => {
    const c = await store()
    const variantId = await variantOf(c, 'shea-body-butter-250ml', 1)
    const { cartId } = await readyCart(c, variantId)
    await c.post(`/api/store/carts/${cartId}/payment-sessions`, { providerId: 'manual' })
    const cart = (await c.get<{ cart: Cart }>(`/api/store/carts/${cartId}`)).body.cart
    await c.post(`/api/store/carts/${cartId}/line-items/${cart.items[0]!.id}`, { quantity: 2 })
    const res = await c.post(`/api/store/carts/${cartId}/complete`)
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'payment_session_stale' })
  })

  it('the last unit can only be sold once; the loser’s reservation is released', async () => {
    const admin = await adminClient()
    const locs = await admin.get<{ data: { id: string }[] }>('/api/admin/stock-locations')
    const channels = await admin.get<{ data: { id: string; name: string }[] }>('/api/admin/sales-channels')
    const web = channels.body.data.find((ch) => ch.name === 'Web store')!
    const created = await admin.post<{ product: { handle: string; variants: { id: string }[] } }>('/api/admin/products', {
      title: `Last one ${Date.now()}`,
      status: 'published',
      salesChannelIds: [web.id],
      variants: [{ options: {}, prices: [{ amount: 5000, currencyCode: 'GHS' }], inventory: [{ locationId: locs.body.data[0]!.id, stocked: 1 }] }],
    })
    const variantId = created.body.product.variants[0]!.id
    const a = await store()
    const b = await store()
    const ca = await readyCart(a, variantId)
    const cb = await readyCart(b, variantId)
    await a.post(`/api/store/carts/${ca.cartId}/payment-sessions`, { providerId: 'manual' })
    await b.post(`/api/store/carts/${cb.cartId}/payment-sessions`, { providerId: 'manual' })
    const [ra, rb] = await Promise.all([a.post(`/api/store/carts/${ca.cartId}/complete`), b.post(`/api/store/carts/${cb.cartId}/complete`)])
    expect([ra.status, rb.status].sort()).toEqual([200, 409])
    expect(await reservedFor(variantId)).toBe(1)
    const loser = ra.status === 409 ? ca.cartId : cb.cartId
    const leftovers = await db().select().from(t.reservation).where(eq(t.reservation.cartId, loser))
    expect(leftovers).toHaveLength(0)
  })

  it('rejects providers not enabled in the region and webhooks with bad signatures', async () => {
    const c = await store()
    const variantId = await variantOf(c, 'shea-body-butter-250ml')
    const { cartId } = await readyCart(c, variantId)
    expect((await c.post(`/api/store/carts/${cartId}/payment-sessions`, { providerId: 'stripe' })).status).toBe(400)
    const hook = await new Client().post('/api/webhooks/paystack', { event: 'charge.success', data: { id: 1, reference: 'x' } }, { 'x-paystack-signature': 'bad' })
    expect([400, 503]).toContain(hook.status)
  })
})

async function reservedFor(variantId: string): Promise<number> {
  const [row] = await db()
    .select({ reserved: sql<number>`coalesce(sum(${t.inventoryLevel.reserved}), 0)::int` })
    .from(t.inventoryLevel)
    .innerJoin(t.inventoryItem, and(eq(t.inventoryItem.id, t.inventoryLevel.inventoryItemId), eq(t.inventoryItem.variantId, variantId)))
  return row?.reserved ?? 0
}
