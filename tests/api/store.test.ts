import { describe, expect, it } from 'vitest'
import { Client, hasServer } from './client'
import { adminClient, publishableKey } from './helpers'

interface Card {
  handle: string
  title: string
  price: { amount: number; currencyCode: string } | null
  inStock: boolean
}
interface StoreProduct {
  id: string
  title: string
  options: { title: string; values: string[] }[]
  variants: { id: string; title: string; options: Record<string, string>; price: { amount: number; originalAmount: number } | null; inStock: boolean }[]
  related: Card[]
}
interface Cart {
  id: string
  currencyCode: string
  items: { id: string; variantId: string; quantity: number; unitPrice: number; total: number; discountTotal: number }[]
  promotions: { code: string; amount: number }[]
  totals: { itemSubtotal: number; discountTotal: number; taxTotal: number; total: number; itemCount: number }
}

async function store() {
  return new Client({ 'x-publishable-api-key': await publishableKey() })
}
async function regions(c: Client) {
  return (await c.get<{ defaultRegionId: string; data: { id: string; name: string; currencyCode: string }[] }>('/api/store/regions')).body
}

describe.skipIf(!hasServer)('store catalog', () => {
  it('lists only published products in the key’s channels, priced in the default region', async () => {
    const c = await store()
    const res = await c.get<{ data: Card[]; count: number; facets: { options: Record<string, string[]>; price: { min: number; max: number } } }>('/api/store/products?limit=50')
    expect(res.status).toBe(200)
    const tote = res.body.data.find((p) => p.handle === 'kente-weave-tote')!
    expect(tote.price).toMatchObject({ amount: 45000, currencyCode: 'GHS' })
    expect(res.body.facets.options.Size).toEqual(expect.arrayContaining(['S', 'M', 'L', 'XL']))

    // Drafts created by other tests are never listed
    const admin = await adminClient()
    const draft = await admin.post<{ product: { handle: string } }>('/api/admin/products', { title: `Hidden draft ${Date.now()}` })
    const again = await c.get<{ data: Card[] }>('/api/store/products?limit=100')
    expect(again.body.data.some((p) => p.handle === draft.body.product.handle)).toBe(false)
    expect((await c.get(`/api/store/products/${draft.body.product.handle}`)).status).toBe(404)
  })

  it('filters by collection, category tree, option, price and sorts by price', async () => {
    const c = await store()
    const byCollection = await c.get<{ data: Card[] }>('/api/store/products?collection=home-and-table')
    expect(byCollection.body.data.map((p) => p.handle).sort()).toEqual(['ceramic-pour-over-set', 'woven-market-basket'])
    const byParentCategory = await c.get<{ data: Card[] }>('/api/store/products?category=apparel')
    expect(byParentCategory.body.data.map((p) => p.handle).sort()).toEqual(['adinkra-linen-shirt', 'batik-silk-scarf'])
    const byOption = await c.get<{ data: Card[] }>('/api/store/products?options=Lemongrass')
    expect(byOption.body.data.map((p) => p.handle)).toEqual(['shea-body-butter-250ml'])
    const cheap = await c.get<{ data: Card[] }>('/api/store/products?maxPrice=12000')
    expect(cheap.body.data.every((p) => (p.price?.amount ?? 0) <= 12000)).toBe(true)
    const sorted = await c.get<{ data: Card[] }>('/api/store/products?order=price_asc&collection=harmattan-edit')
    const amounts = sorted.body.data.map((p) => p.price!.amount)
    expect([...amounts].sort((a, b) => a - b)).toEqual(amounts)
  })

  it('returns product detail with variant prices, sale prices and related products', async () => {
    const c = await store()
    const res = await c.get<{ product: StoreProduct }>('/api/store/products/batik-silk-scarf')
    expect(res.status).toBe(200)
    const v = res.body.product.variants[0]!
    // Seeded "Harmattan sale" price list: 15% off
    expect(v.price).toMatchObject({ amount: 44200, originalAmount: 52000 })
    expect(res.body.product.related.length).toBeGreaterThan(0)
    const usd = (await regions(c)).data.find((r) => r.currencyCode === 'USD')!
    const inUsd = await c.get<{ product: StoreProduct }>(`/api/store/products/kente-weave-tote?regionId=${usd.id}`)
    expect(inUsd.body.product.variants[0]!.price!.amount).toBe(3900)
  })
})

describe.skipIf(!hasServer)('store cart', () => {
  it('create → add → update → promo → region change → remove', async () => {
    const c = await store()
    const created = await c.post<{ cart: Cart }>('/api/store/carts', {})
    expect(created.status).toBe(200)
    const cartId = created.body.cart.id
    expect(created.body.cart.currencyCode).toBe('GHS')

    const tote = (await c.get<{ product: StoreProduct }>('/api/store/products/kente-weave-tote')).body.product
    const added = await c.post<{ cart: Cart }>(`/api/store/carts/${cartId}/line-items`, { variantId: tote.variants[0]!.id, quantity: 1 })
    expect(added.status).toBe(200)
    expect(added.body.cart.items[0]).toMatchObject({ unitPrice: 45000, quantity: 1 })
    // Adding the same variant merges lines
    const merged = await c.post<{ cart: Cart }>(`/api/store/carts/${cartId}/line-items`, { variantId: tote.variants[0]!.id, quantity: 1 })
    expect(merged.body.cart.items).toHaveLength(1)
    expect(merged.body.cart.items[0]!.quantity).toBe(2)
    // GHS is 15% VAT inclusive: 90000 gross contains 11739 tax
    expect(merged.body.cart.totals).toMatchObject({ itemSubtotal: 90000, taxTotal: 11739, total: 90000, itemCount: 2 })

    const tooMany = await c.post(`/api/store/carts/${cartId}/line-items/${merged.body.cart.items[0]!.id}`, { quantity: 500 })
    expect(tooMany.status).toBe(409)
    expect(tooMany.body).toMatchObject({ code: 'insufficient_inventory' })

    const bad = await c.post(`/api/store/carts/${cartId}/promotions`, { code: 'NOPE' })
    expect(bad.status).toBe(400)
    const promo = await c.post<{ cart: Cart }>(`/api/store/carts/${cartId}/promotions`, { code: 'harmattan10' })
    expect(promo.status).toBe(200)
    expect(promo.body.cart.promotions).toEqual([expect.objectContaining({ code: 'HARMATTAN10', amount: 9000 })])
    expect(promo.body.cart.totals.total).toBe(81000)
    const draftPromo = await c.post(`/api/store/carts/${cartId}/promotions`, { code: 'STAFF20' })
    expect(draftPromo.status).toBe(400)
    expect(draftPromo.body).toMatchObject({ code: 'promotion_not_applicable' })

    const usd = (await regions(c)).data.find((r) => r.currencyCode === 'USD')!
    const moved = await c.post<{ cart: Cart }>(`/api/store/carts/${cartId}`, { regionId: usd.id, email: 'shopper@example.com' })
    expect(moved.body.cart.currencyCode).toBe('USD')
    expect(moved.body.cart.items[0]!.unitPrice).toBe(3900)

    const removed = await c.delete<{ cart: Cart }>(`/api/store/carts/${cartId}/line-items/${moved.body.cart.items[0]!.id}`)
    expect(removed.body.cart.items).toHaveLength(0)
    expect(removed.body.cart.totals.total).toBe(0)
  })

  it('refuses carts from another key’s channel and unknown variants', async () => {
    const c = await store()
    const cart = (await c.post<{ cart: Cart }>('/api/store/carts', {})).body.cart
    expect((await c.post(`/api/store/carts/${cart.id}/line-items`, { variantId: 'variant_nope', quantity: 1 })).status).toBe(404)
    expect((await new Client().get(`/api/store/carts/${cart.id}`)).status).toBe(401)
  })
})
