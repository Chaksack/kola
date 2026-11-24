import { describe, expect, it } from 'vitest'
import { hasServer } from './client'
import { adminClient, uniqueEmail } from './helpers'
import { levelsFor } from './order-helpers'

describe.skipIf(!hasServer)('draft orders', () => {
  it('creates a priced draft, converts it as paid and reserves stock', async () => {
    const c = await adminClient()
    const regions = await c.get<{ data: { id: string; currencyCode: string }[] }>('/api/admin/regions')
    const gh = regions.body.data.find((r) => r.currencyCode === 'GHS')!
    const variant = (await c.get<{ data: { id: string; title: string }[] }>('/api/admin/variants?q=Ceramic')).body.data[0]!
    const options = await c.get<{ data: { id: string; name: string }[] }>(`/api/admin/shipping-options?regionId=${gh.id}`)
    const pickup = options.body.data.find((o) => o.name.includes('Pick up'))!
    const before = await levelsFor(variant.id)

    const created = await c.post<{ draftOrder: { id: string } }>('/api/admin/draft-orders', { email: uniqueEmail('phone'), regionId: gh.id, shippingOptionId: pickup.id, items: [{ variantId: variant.id, quantity: 1 }, { variantId: variant.id, quantity: 1, unitPrice: 80000 }] })
    expect(created.status).toBe(200)
    const drafts = await c.get<{ data: { id: string; total: number }[] }>('/api/admin/draft-orders')
    const draft = drafts.body.data.find((d) => d.id === created.body.draftOrder.id)!
    expect(draft.total).toBe(89000 + 80000)
    // Drafts are hidden from the orders list
    const listed = await c.get<{ data: { id: string }[] }>('/api/admin/orders?limit=200')
    expect(listed.body.data.some((o) => o.id === draft.id)).toBe(false)

    const converted = await c.post<{ order: { id: string } }>(`/api/admin/draft-orders/${draft.id}/convert`, { paid: true })
    expect(converted.status).toBe(200)
    const order = await c.get<{ order: { paymentStatus: string; isDraft: boolean } }>(`/api/admin/orders/${draft.id}`)
    expect(order.body.order).toMatchObject({ paymentStatus: 'captured', isDraft: false })
    expect((await levelsFor(variant.id)).reserved).toBe(before.reserved + 2)
    expect((await c.post(`/api/admin/draft-orders/${draft.id}/convert`, { paid: true })).status).toBe(409)
  })
})
