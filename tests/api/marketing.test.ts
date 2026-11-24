import { describe, expect, it } from 'vitest'
import { Client, hasServer } from './client'
import { adminClient, clientWithRole, publishableKey, uniqueEmail } from './helpers'

const suffix = () => Math.random().toString(36).slice(2, 7).toUpperCase()

async function store() {
  return new Client({ 'x-publishable-api-key': await publishableKey() })
}
async function variantId(c: Client, handle: string, idx = 0) {
  return (await c.get<{ product: { variants: { id: string }[] } }>(`/api/store/products/${handle}`)).body.product.variants[idx]!.id
}

describe.skipIf(!hasServer)('customers and groups', () => {
  it('lists, searches, edits groups and shows order history', async () => {
    const c = await adminClient()
    const list = await c.get<{ data: { email: string; orderCount: number; spent: number }[]; count: number }>('/api/admin/customers?q=ama.owusu')
    expect(list.body.data[0]).toMatchObject({ email: 'ama.owusu@example.com' })
    expect(list.body.data[0]!.orderCount).toBeGreaterThan(0)

    const group = await c.post<{ group: { id: string } }>('/api/admin/customer-groups', { name: `Testers ${suffix()}` })
    const created = await c.post<{ customer: { id: string } }>('/api/admin/customers', { email: uniqueEmail('crm'), firstName: 'Nana', groupIds: [group.body.group.id] })
    expect(created.status).toBe(200)
    const filtered = await c.get<{ data: { id: string }[] }>(`/api/admin/customers?groupId=${group.body.group.id}`)
    expect(filtered.body.data.map((x) => x.id)).toEqual([created.body.customer.id])
    const detail = await c.get<{ customer: { groups: { id: string }[]; passwordHash?: string } }>(`/api/admin/customers/${created.body.customer.id}`)
    expect(detail.body.customer.groups.map((g) => g.id)).toEqual([group.body.group.id])
    expect(detail.body.customer.passwordHash).toBeUndefined()
    expect((await c.post('/api/admin/customers', { email: detail.body.customer ? (await c.get<{ customer: { email: string } }>(`/api/admin/customers/${created.body.customer.id}`)).body.customer.email : '' })).status).toBe(409)
  })
})

describe.skipIf(!hasServer)('promotions in the cart', () => {
  it('an admin-created collection promotion applies to matching items only, and respects its usage limit', async () => {
    const admin = await adminClient()
    const collections = await admin.get<{ data: { id: string; handle: string }[] }>('/api/admin/collections')
    const home = collections.body.data.find((x) => x.handle === 'home-and-table')!
    const code = `HOME${suffix()}`
    const created = await admin.post<{ promotion: { id: string } }>('/api/admin/promotions', {
      code,
      status: 'active',
      applicationType: 'percentage',
      value: 2000,
      targetType: 'items',
      allocation: 'across',
      usageLimit: 1,
      rules: [{ ruleType: 'target', attribute: 'collection', operator: 'in', values: [home.id] }],
    })
    expect(created.status).toBe(200)
    const dup = await admin.post('/api/admin/promotions', { code, applicationType: 'percentage', value: 100 })
    expect(dup.status).toBe(409)
    const bad = await admin.post('/api/admin/promotions', { code: `X${suffix()}`, applicationType: 'percentage', value: 15000 })
    expect(bad.status).toBe(400)

    const c = await store()
    const cart = (await c.post<{ cart: { id: string } }>('/api/store/carts', {})).body.cart
    await c.post(`/api/store/carts/${cart.id}/line-items`, { variantId: await variantId(c, 'woven-market-basket'), quantity: 1 })
    await c.post(`/api/store/carts/${cart.id}/line-items`, { variantId: await variantId(c, 'shea-body-butter-250ml'), quantity: 1 })
    const applied = await c.post<{ cart: { promotions: { code: string; amount: number }[]; items: { title: string; discountTotal: number }[] } }>(`/api/store/carts/${cart.id}/promotions`, { code: code.toLowerCase() })
    expect(applied.status).toBe(200)
    expect(applied.body.cart.promotions[0]).toMatchObject({ code, amount: 5200 })
    expect(applied.body.cart.items.find((i) => i.title === 'Shea Body Butter 250ml')!.discountTotal).toBe(0)

    // Exhaust the single use, then a new cart is refused
    await admin.post(`/api/admin/promotions/${created.body.promotion.id}`, { code, status: 'active', applicationType: 'percentage', value: 2000, targetType: 'items', usageLimit: 1, rules: [] })
    const { db } = await import('./helpers')
    const t = await import('../../server/db/schema')
    const { eq } = await import('drizzle-orm')
    await db().update(t.promotion).set({ usageCount: 1 }).where(eq(t.promotion.id, created.body.promotion.id))
    const cart2 = (await c.post<{ cart: { id: string } }>('/api/store/carts', {})).body.cart
    await c.post(`/api/store/carts/${cart2.id}/line-items`, { variantId: await variantId(c, 'woven-market-basket'), quantity: 1 })
    const refused = await c.post<{ message: string }>(`/api/store/carts/${cart2.id}/promotions`, { code })
    expect(refused.status).toBe(400)
    expect(refused.body.message).toBe('This code has been fully redeemed')

    expect((await admin.delete(`/api/admin/promotions/${created.body.promotion.id}`)).status).toBe(200)
    const reuse = await admin.post('/api/admin/promotions', { code, applicationType: 'percentage', value: 500 })
    expect(reuse.status).toBe(200)
  })
})

describe.skipIf(!hasServer)('price lists', () => {
  it('a customer-group override applies only to signed-in members', async () => {
    const admin = await adminClient()
    const group = await admin.post<{ group: { id: string } }>('/api/admin/customer-groups', { name: `Trade ${suffix()}` })
    const list = await admin.post<{ priceList: { id: string } }>('/api/admin/price-lists', { title: 'Trade pricing', type: 'override' })
    const pot = (await admin.get<{ data: { id: string; title: string }[] }>('/api/admin/variants?q=Pour-Over')).body.data[0]!
    await admin.post(`/api/admin/price-lists/${list.body.priceList.id}`, { title: 'Trade pricing', type: 'override', status: 'active', customerGroupIds: [group.body.group.id] })
    const set = await admin.post<{ priceList: { prices: { amount: number; baseAmount: number }[] } }>(`/api/admin/price-lists/${list.body.priceList.id}/prices`, { prices: [{ variantId: pot.id, currencyCode: 'GHS', amount: 70000 }] })
    expect(set.body.priceList.prices[0]).toMatchObject({ amount: 70000, baseAmount: 89000 })

    const shopper = await store()
    const anon = await shopper.get<{ product: { variants: { id: string; price: { amount: number } }[] } }>('/api/store/products/ceramic-pour-over-set')
    expect(anon.body.product.variants.find((v) => v.id === pot.id)!.price.amount).toBe(89000)

    const email = uniqueEmail('trade')
    await shopper.post('/api/store/customers', { email, password: 'trade-pass-123', firstName: 'Trade' })
    const me = (await admin.get<{ data: { id: string }[] }>(`/api/admin/customers?q=${encodeURIComponent(email)}`)).body.data[0]!
    await admin.post(`/api/admin/customer-groups/${group.body.group.id}/customers`, { add: [me.id] })
    const member = await shopper.get<{ product: { variants: { id: string; price: { amount: number; priceListType: string } }[] } }>('/api/store/products/ceramic-pour-over-set')
    expect(member.body.product.variants.find((v) => v.id === pot.id)!.price).toMatchObject({ amount: 70000, priceListType: 'override' })
  })
})

describe.skipIf(!hasServer)('gift cards', () => {
  it('returns the code once and masks it in lists; members cannot issue', async () => {
    const admin = await adminClient()
    const created = await admin.post<{ giftCard: { id: string; code: string; balance: number } }>('/api/admin/gift-cards', { value: 20000, currencyCode: 'GHS' })
    expect(created.body.giftCard.code).toMatch(/^KOLA-/)
    const list = await admin.get<{ data: { id: string; code?: string; codeLast4: string }[] }>('/api/admin/gift-cards?limit=200')
    const row = list.body.data.find((g) => g.id === created.body.giftCard.id)!
    expect(row.code).toBeUndefined()
    expect(row.codeLast4).toBe(created.body.giftCard.code.slice(-4))
    expect((await admin.post(`/api/admin/gift-cards/${row.id}`, { balance: 999999 })).status).toBe(400)
    const member = await clientWithRole('member')
    expect((await member.post('/api/admin/gift-cards', { value: 100, currencyCode: 'GHS' })).status).toBe(403)
  })
})
