import { describe, expect, it } from 'vitest'
import { hasServer } from './client'
import { adminClient, clientWithRole } from './helpers'
import { levelsFor, placeOrder } from './order-helpers'

interface Item {
  id: string
  variantId: string
  quantity: number
  fulfilledQuantity: number
  returnedQuantity: number
  total: number
}
interface AdminOrder {
  id: string
  displayId: number
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  total: number
  version: number
  refundedTotal: number
  items: Item[]
  fulfillments: { id: string; shippedAt: string | null; tracking: { trackingNumber: string }[] }[]
  returns: { id: string; status: string; items: { id: string }[] }[]
  changes: { id: string; status: string; differenceDue: number }[]
  events: { type: string; message: string }[]
  paymentSummary: { captured: number; refundable: number }
}
type R = { order: AdminOrder }

async function locations() {
  const c = await adminClient()
  return (await c.get<{ data: { id: string; name: string }[] }>('/api/admin/stock-locations')).body.data
}

describe.skipIf(!hasServer)('admin orders', () => {
  it('lists with tab counts, searches by number, and serves KPI stats', async () => {
    const c = await adminClient()
    const placed = await placeOrder([{ handle: 'shea-body-butter-250ml', quantity: 1 }])
    const list = await c.get<{ data: { id: string }[]; tabs: Record<string, number> }>('/api/admin/orders?tab=unfulfilled')
    expect(list.body.tabs.unfulfilled).toBeGreaterThan(0)
    expect(list.body.tabs.all).toBeGreaterThanOrEqual(list.body.tabs.unfulfilled)
    const found = await c.get<{ data: { id: string }[] }>(`/api/admin/orders?q=%23${placed.displayId}`)
    expect(found.body.data.map((o) => o.id)).toEqual([placed.id])
    const stats = await c.get<{ grossSales: { value: number }; orders: { value: number }; awaitingFulfillment: { value: number } }>('/api/admin/stats/orders')
    expect(stats.body.orders.value).toBeGreaterThan(0)
    expect(stats.body.awaitingFulfillment.value).toBeGreaterThan(0)
  })

  it('capture → partial fulfill → ship → deliver → return with refund', async () => {
    const c = await adminClient()
    const [tema] = await locations()
    const placed = await placeOrder([{ handle: 'woven-market-basket', quantity: 2 }])
    let order = (await c.get<R>(`/api/admin/orders/${placed.id}`)).body.order
    const item = order.items[0]!
    const before = await levelsFor(item.variantId)

    order = (await c.post<R>(`/api/admin/orders/${placed.id}/capture`)).body.order
    expect(order.paymentStatus).toBe('captured')

    const f1 = await c.post<R>(`/api/admin/orders/${placed.id}/fulfillments`, { locationId: tema!.id, items: [{ itemId: item.id, quantity: 1 }] })
    expect(f1.status).toBe(200)
    expect(f1.body.order.fulfillmentStatus).toBe('partially_fulfilled')
    const mid = await levelsFor(item.variantId)
    expect(mid).toEqual({ stocked: before.stocked - 1, reserved: before.reserved - 1 })

    const over = await c.post(`/api/admin/orders/${placed.id}/fulfillments`, { locationId: tema!.id, items: [{ itemId: item.id, quantity: 5 }] })
    expect(over.status).toBe(400)

    const f2 = await c.post<R>(`/api/admin/orders/${placed.id}/fulfillments`, { locationId: tema!.id, items: [{ itemId: item.id, quantity: 1 }] })
    expect(f2.body.order.fulfillmentStatus).toBe('fulfilled')
    for (const f of f2.body.order.fulfillments) {
      const shipped = await c.post<R>(`/api/admin/orders/${placed.id}/fulfillments/${f.id}/ship`, { tracking: [{ number: `GH${f.id.slice(-6)}`, carrier: 'Kola Dispatch' }] })
      expect(shipped.status).toBe(200)
    }
    order = (await c.get<R>(`/api/admin/orders/${placed.id}`)).body.order
    expect(order.fulfillmentStatus).toBe('shipped')
    expect(order.fulfillments[0]!.tracking[0]!.trackingNumber).toMatch(/^GH/)
    for (const f of order.fulfillments) await c.post(`/api/admin/orders/${placed.id}/fulfillments/${f.id}/deliver`)
    order = (await c.get<R>(`/api/admin/orders/${placed.id}`)).body.order
    expect(order).toMatchObject({ fulfillmentStatus: 'delivered', status: 'completed' })

    // Shipped orders can't be canceled
    expect((await c.post(`/api/admin/orders/${placed.id}/cancel`, {})).status).toBe(409)

    const ret = await c.post<R>(`/api/admin/orders/${placed.id}/returns`, { items: [{ itemId: item.id, quantity: 1 }] })
    expect(ret.status).toBe(200)
    const returnId = ret.body.order.returns[0]!.id
    const afterShip = await levelsFor(item.variantId)
    const received = await c.post<R>(`/api/admin/orders/${placed.id}/returns/${returnId}/receive`, { locationId: tema!.id, refund: true })
    expect(received.status).toBe(200)
    order = received.body.order
    expect(order.items[0]!.returnedQuantity).toBe(1)
    expect(order.refundedTotal).toBe(item.total / 2)
    expect(order.paymentStatus).toBe('partially_refunded')
    expect((await levelsFor(item.variantId)).stocked).toBe(afterShip.stocked + 1)
    // Can't return more than was kept
    expect((await c.post(`/api/admin/orders/${placed.id}/returns`, { items: [{ itemId: item.id, quantity: 2 }] })).status).toBe(400)
    expect(order.events.map((e) => e.type)).toEqual(expect.arrayContaining(['return.received', 'payment.refunded', 'fulfillment.shipped']))
  })

  it('cancels an unshipped order and releases its reservations', async () => {
    const c = await adminClient()
    const placed = await placeOrder([{ handle: 'kente-weave-tote', quantity: 1 }])
    const order = (await c.get<R>(`/api/admin/orders/${placed.id}`)).body.order
    const before = await levelsFor(order.items[0]!.variantId)
    const res = await c.post<R>(`/api/admin/orders/${placed.id}/cancel`, { reason: 'Customer request' })
    expect(res.body.order).toMatchObject({ status: 'canceled', fulfillmentStatus: 'canceled' })
    expect((await levelsFor(order.items[0]!.variantId)).reserved).toBe(before.reserved - 1)
    expect((await c.post(`/api/admin/orders/${placed.id}/capture`)).status).toBe(409)
  })

  it('edits an order: propose with difference, then confirm a new version', async () => {
    const c = await adminClient()
    const placed = await placeOrder([{ handle: 'single-origin-cocoa-nibs', quantity: 1 }])
    const order = (await c.get<R>(`/api/admin/orders/${placed.id}`)).body.order
    const variants = await c.get<{ data: { id: string; productTitle: string }[] }>('/api/admin/variants?q=Cocoa')
    const big = variants.body.data.find((v) => v.id !== order.items[0]!.variantId)!
    const proposed = await c.post<{ result: { differenceDue: number; change: { id: string } } }>(`/api/admin/orders/${placed.id}/edits`, {
      actions: [{ action: 'item_update', itemId: order.items[0]!.id, quantity: 2 }, { action: 'item_add', variantId: big.id, quantity: 1 }],
    })
    expect(proposed.status).toBe(200)
    expect(proposed.body.result.differenceDue).toBe(9500 + 17000)
    const again = await c.post(`/api/admin/orders/${placed.id}/edits`, { actions: [{ action: 'item_remove', itemId: order.items[0]!.id }] })
    expect(again.status).toBe(409)
    const confirmed = await c.post<R>(`/api/admin/orders/${placed.id}/edits/${proposed.body.result.change.id}/confirm`)
    expect(confirmed.body.order.version).toBe(2)
    expect(confirmed.body.order.total).toBe(order.total + 26500)
    expect(confirmed.body.order.items).toHaveLength(2)
  })

  it('creates an exchange that settles when the return arrives', async () => {
    const c = await adminClient()
    const [tema] = await locations()
    const placed = await placeOrder([{ handle: 'adinkra-linen-shirt', variant: 0, quantity: 1 }])
    let order = (await c.get<R>(`/api/admin/orders/${placed.id}`)).body.order
    await c.post(`/api/admin/orders/${placed.id}/fulfillments`, { locationId: tema!.id, items: [{ itemId: order.items[0]!.id, quantity: 1 }] })
    order = (await c.get<R>(`/api/admin/orders/${placed.id}`)).body.order
    const shirts = await c.get<{ data: { id: string; title: string }[] }>('/api/admin/variants?q=Adinkra')
    const size = shirts.body.data.find((v) => v.title === 'L / Natural')!
    const ex = await c.post<R>(`/api/admin/orders/${placed.id}/exchanges`, { returnItems: [{ itemId: order.items[0]!.id, quantity: 1 }], newItems: [{ variantId: size.id, quantity: 1 }] })
    expect(ex.status).toBe(200)
    const ret = ex.body.order.returns[0]!
    const done = await c.post<R>(`/api/admin/orders/${placed.id}/returns/${ret.id}/receive`, { locationId: tema!.id, refund: false })
    expect(done.status).toBe(200)
    expect(done.body.order.items).toHaveLength(2)
    expect(done.body.order.events.some((e) => e.type === 'exchange.completed')).toBe(true)
  })

  it('members can fulfill and add notes but not refund or cancel', async () => {
    const member = await clientWithRole('member')
    const placed = await placeOrder([{ handle: 'shea-body-butter-250ml', quantity: 1 }])
    expect((await member.post(`/api/admin/orders/${placed.id}/notes`, { message: 'Called customer' })).status).toBe(200)
    expect((await member.post(`/api/admin/orders/${placed.id}/cancel`, {})).status).toBe(403)
    expect((await member.post(`/api/admin/orders/${placed.id}/refund`, { amount: 100 })).status).toBe(403)
  })
})
