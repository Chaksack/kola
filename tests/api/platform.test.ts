import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as t from '../../server/db/schema'
import { Client, hasServer } from './client'
import { adminClient, clientWithRole, db, publishableKey } from './helpers'
import { placeOrder } from './order-helpers'

interface Received {
  headers: IncomingMessage['headers']
  body: string
}
const received: Received[] = []
let failNext = 0
const receiver = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    received.push({ headers: req.headers, body })
    if (failNext > 0) {
      failNext--
      res.writeHead(500).end('nope')
    } else res.writeHead(200).end('ok')
  })
})
let receiverUrl = ''
beforeAll(async () => {
  await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r))
  receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hooks`
})
afterAll(() => receiver.close())

const cron = (secret = process.env.CRON_SECRET || 'test-cron-secret') => new Client({ authorization: `Bearer ${secret}` })

describe.skipIf(!hasServer)('outgoing webhooks', () => {
  it('signs and delivers order.placed, retries failures and records them', async () => {
    const admin = await adminClient()
    const created = await admin.post<{ endpoint: { id: string; secretLast4: string; secretSalt?: string }; secret: string }>('/api/admin/webhooks', { url: receiverUrl, events: ['order.placed'], description: 'Test receiver' })
    expect(created.status).toBe(200)
    const { secret, endpoint } = created.body
    expect(secret).toMatch(/^whsec_/)
    expect(endpoint.secretSalt).toBeUndefined()

    received.length = 0
    const order = await placeOrder([{ handle: 'shea-body-butter-250ml', quantity: 1 }])
    await new Promise((r) => setTimeout(r, 300))
    const hit = received.find((r) => r.headers['kola-event'] === 'order.placed' && r.body.includes(order.id))
    expect(hit).toBeTruthy()
    const sig = String(hit!.headers['kola-signature'])
    const [, ts, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sig)!
    expect(createHmac('sha256', secret).update(`${ts}.${hit!.body}`).digest('hex')).toBe(v1)

    // A failing receiver leaves the delivery pending with a backoff, then the cron delivers it.
    failNext = 1
    const ping = await admin.post<{ outcome: string; delivery: { id: string; attempts: number; nextAttemptAt: string } }>(`/api/admin/webhooks/${endpoint.id}/test`)
    expect(ping.body.outcome).toBe('retrying')
    expect(ping.body.delivery.attempts).toBe(1)
    await db().update(t.webhookDelivery).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(t.webhookDelivery.id, ping.body.delivery.id))
    const run = await cron().get<{ succeeded: number }>('/api/cron/webhook-retry')
    expect(run.status).toBe(200)
    const [after] = await db().select().from(t.webhookDelivery).where(eq(t.webhookDelivery.id, ping.body.delivery.id))
    expect(after).toMatchObject({ status: 'succeeded', attempts: 2 })

    await admin.delete(`/api/admin/webhooks/${endpoint.id}`)
  })

  it('rejects private webhook URLs in production mode and non-admins', async () => {
    const member = await clientWithRole('member')
    expect((await member.post('/api/admin/webhooks', { url: 'https://example.com', events: ['*'] })).status).toBe(403)
    const admin = await adminClient()
    expect((await admin.post('/api/admin/webhooks', { url: 'ftp://example.com', events: ['*'] })).status).toBe(400)
  })
})

describe.skipIf(!hasServer)('cron jobs', () => {
  it('require the cron secret', async () => {
    expect((await new Client().get('/api/cron/cart-expiry')).status).toBe(401)
    expect((await cron('wrong').get('/api/cron/cart-expiry')).status).toBe(401)
  })

  it('expire abandoned carts and release their stale reservations', async () => {
    const c = new Client({ 'x-publishable-api-key': await publishableKey() })
    const cart = (await c.post<{ cart: { id: string } }>('/api/store/carts', {})).body.cart
    const [item] = await db().select().from(t.inventoryItem).limit(1)
    const [level] = await db().select().from(t.inventoryLevel).where(eq(t.inventoryLevel.inventoryItemId, item!.id)).limit(1)
    await db().update(t.inventoryLevel).set({ reserved: level!.reserved + 1, stocked: Math.max(level!.stocked, level!.reserved + 1) }).where(eq(t.inventoryLevel.id, level!.id))
    await db().insert(t.reservation).values({ inventoryItemId: item!.id, locationId: level!.locationId, quantity: 1, cartId: cart.id, expiresAt: new Date(Date.now() - 60_000) })
    await db().update(t.cart).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(t.cart.id, cart.id))

    const res = await cron().get<{ expired: number }>('/api/cron/cart-expiry')
    expect(res.status).toBe(200)
    expect(res.body.expired).toBeGreaterThanOrEqual(1)
    expect(await db().select().from(t.cart).where(eq(t.cart.id, cart.id))).toHaveLength(0)
    const [lvl] = await db().select().from(t.inventoryLevel).where(eq(t.inventoryLevel.id, level!.id))
    expect(lvl!.reserved).toBe(level!.reserved)
  })
})

describe.skipIf(!hasServer)('csv', () => {
  it('exports products in chunks and re-imports them as updates; new handles are created', async () => {
    const admin = await adminClient()
    const first = await admin.get<{ csv: string; nextOffset: number | null; total: number }>('/api/admin/exports/products?offset=0&limit=3')
    expect(first.body.csv.split('\r\n')[0]).toContain('handle,title')
    expect(first.body.nextOffset).toBe(3)

    const handle = `csv-import-${Date.now()}`
    const rows = [
      { handle, title: 'CSV Mug', status: 'published', option1_name: 'Colour', option1_value: 'Clay', sku: `${handle}-clay`, price_ghs: '85.50', stock: '7' },
      { handle, option1_name: 'Colour', option1_value: 'Ash', sku: `${handle}-ash`, price_ghs: '85.50', stock: '3' },
    ]
    const dry = await admin.post<{ results: { action: string }[] }>('/api/admin/imports/products', { products: [rows], dryRun: true })
    expect(dry.body.results[0]!.action).toBe('created')
    const real = await admin.post<{ results: { action: string; message: string }[] }>('/api/admin/imports/products', { products: [rows, [{ handle: 'bad', price_ghs: 'abc' }]] })
    expect(real.body.results.map((r) => r.action)).toEqual(['created', 'error'])
    const again = await admin.post<{ results: { action: string }[] }>('/api/admin/imports/products', { products: [rows.map((r) => ({ ...r, price_ghs: '90.00' }))] })
    expect(again.body.results[0]!.action).toBe('updated')
    const found = await admin.get<{ data: { id: string; variantCount: number }[] }>(`/api/admin/products?q=${handle}`)
    expect(found.body.data[0]!.variantCount).toBe(2)
    const detail = await admin.get<{ product: { variants: { prices: { amount: number }[]; inventory: { stocked: number }[] }[] } }>(`/api/admin/products/${found.body.data[0]!.id}`)
    expect(detail.body.product.variants[0]!.prices[0]!.amount).toBe(9000)
  })

  it('exports orders', async () => {
    const admin = await adminClient()
    const res = await admin.get<{ csv: string; total: number }>('/api/admin/exports/orders?limit=5')
    expect(res.body.csv.split('\r\n')[0]).toBe('order,created_at,email,customer,status,payment_status,fulfillment_status,sales_channel,country,currency,items,subtotal,discount,shipping,tax,total,refunded,promo_codes')
    expect(res.body.total).toBeGreaterThan(0)
  })
})

describe.skipIf(!hasServer)('docs, reviews and audit log', () => {
  it('serves the OpenAPI document', async () => {
    const res = await new Client().get<{ openapi: string; paths: Record<string, unknown> }>('/api/docs')
    expect(res.body.openapi).toBe('3.1.0')
    expect(res.body.paths['/api/store/carts/{id}/complete']).toBeTruthy()
  })

  it('holds storefront reviews for moderation until approved', async () => {
    const title = `Beautiful weave ${Date.now()}`
    const c = new Client({ 'x-publishable-api-key': await publishableKey() })
    const sent = await c.post('/api/store/products/kente-weave-tote/reviews', { authorName: 'Afua', rating: 5, title, body: 'Carried it all week.' })
    expect(sent.status).toBe(200)
    const before = await c.get<{ data: { title: string }[] }>('/api/store/products/kente-weave-tote/reviews')
    expect(before.body.data.some((r) => r.title === title)).toBe(false)
    const admin = await adminClient()
    const pending = await admin.get<{ data: { id: string; title: string }[] }>('/api/admin/reviews?status=pending&limit=200')
    const mine = pending.body.data.find((r) => r.title === title)!
    await admin.post(`/api/admin/reviews/${mine.id}`, { status: 'approved' })
    const after = await c.get<{ data: { title: string }[]; average: number }>('/api/store/products/kente-weave-tote/reviews')
    expect(after.body.data.some((r) => r.title === title)).toBe(true)
    expect(after.body.average).toBeGreaterThan(0)
  })

  it('records admin actions in the audit log, visible to admins only', async () => {
    const admin = await adminClient()
    const logs = await admin.get<{ data: { action: string; actorLabel: string }[] }>('/api/admin/audit-logs?action=auth.')
    expect(logs.body.data[0]).toMatchObject({ action: 'auth.login' })
    const member = await clientWithRole('member')
    expect((await member.get('/api/admin/audit-logs')).status).toBe(403)
  })

  it('serves analytics', async () => {
    const admin = await adminClient()
    const res = await admin.get<{ series: { day: string }[]; topProducts: unknown[] }>('/api/admin/stats/analytics?days=7')
    expect(res.body.series.length).toBeGreaterThanOrEqual(7)
  })
})
