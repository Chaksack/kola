import { describe, expect, it } from 'vitest'
import { hasServer } from './client'
import { adminClient, clientWithRole } from './helpers'

interface Variant {
  id: string
  title: string
  sku: string | null
  options: Record<string, string>
  prices: { amount: number; currencyCode: string; regionId: string | null }[]
  inventory: { locationId: string; stocked: number }[]
}
interface Product {
  id: string
  handle: string
  title: string
  status: string
  options: { title: string; values: string[] }[]
  variants: Variant[]
  tags: string[]
  salesChannelIds: string[]
}

const suffix = () => Math.random().toString(36).slice(2, 8)

describe.skipIf(!hasServer)('catalog API', () => {
  it('lists seeded products with inventory status and filters by SKU search', async () => {
    const c = await adminClient()
    const all = await c.get<{ data: { title: string; inventory: { status: string } }[]; count: number }>('/api/admin/products?limit=50')
    expect(all.status).toBe(200)
    expect(all.body.count).toBeGreaterThanOrEqual(8)
    const giftSearch = await c.get<{ data: { title: string; inventory: { status: string } }[] }>('/api/admin/products?q=Holiday%20Gift')
    expect(giftSearch.body.data.find((p) => p.title === 'Holiday Gift Card')?.inventory.status).toBe('not_tracked')

    const bySku = await c.get<{ data: { title: string }[] }>('/api/admin/products?q=ALS-')
    expect(bySku.body.data.map((p) => p.title)).toContain('Adinkra Linen Shirt')
    const published = await c.get<{ data: { status: string }[] }>('/api/admin/products?status=draft')
    expect(published.body.data.every((p) => p.status === 'draft')).toBe(true)
  })

  it('creates a product, generating variants from options, with prices and stock', async () => {
    const c = await adminClient()
    const [locations, channels] = await Promise.all([
      c.get<{ data: { id: string }[] }>('/api/admin/stock-locations'),
      c.get<{ data: { id: string }[] }>('/api/admin/sales-channels'),
    ])
    const loc = locations.body.data[0]!.id
    const s = suffix()
    const res = await c.post<{ product: Product }>('/api/admin/products', {
      title: `Test Wrap ${s}`,
      status: 'published',
      tags: ['Test', 'wrap'],
      salesChannelIds: [channels.body.data[0]!.id],
      options: [
        { title: 'Size', values: ['S', 'M'] },
        { title: 'Colour', values: ['Red'] },
      ],
      variants: [
        { sku: `TW-S-${s}`, options: { Size: 'S', Colour: 'Red' }, prices: [{ amount: 12000, currencyCode: 'ghs' }], inventory: [{ locationId: loc, stocked: 5 }] },
        { sku: `TW-M-${s}`, options: { Size: 'M', Colour: 'Red' }, prices: [{ amount: 12500, currencyCode: 'GHS' }, { amount: 1100, currencyCode: 'USD' }], inventory: [{ locationId: loc, stocked: 0 }] },
      ],
    })
    expect(res.status).toBe(200)
    const p = res.body.product
    expect(p.handle).toBe(`test-wrap-${s}`)
    expect(p.tags.sort()).toEqual(['test', 'wrap'])
    expect(p.variants.map((v) => v.title)).toEqual(['S / Red', 'M / Red'])
    expect(p.variants[0]!.prices).toEqual([{ amount: 12000, currencyCode: 'GHS', regionId: null, minQuantity: null, maxQuantity: null }])
    expect(p.variants[1]!.inventory.find((l) => l.locationId === loc)?.stocked).toBe(0)

    // Update: drop the M variant, add a value, rename the product
    const upd = await c.post<{ product: Product }>(`/api/admin/products/${p.id}`, {
      title: `Test Wrap ${s} v2`,
      handle: p.handle,
      status: 'draft',
      options: [
        { title: 'Size', values: ['S', 'L'] },
        { title: 'Colour', values: ['Red'] },
      ],
      variants: [
        { id: p.variants[0]!.id, sku: `TW-S-${s}`, options: { Size: 'S', Colour: 'Red' }, prices: [{ amount: 13000, currencyCode: 'GHS' }] },
        { sku: `TW-L-${s}`, options: { Size: 'L', Colour: 'Red' }, prices: [] },
      ],
    })
    expect(upd.status).toBe(200)
    expect(upd.body.product.variants.map((v) => v.title)).toEqual(['S / Red', 'L / Red'])
    expect(upd.body.product.variants[0]!.id).toBe(p.variants[0]!.id)
    expect(upd.body.product.variants[0]!.prices[0]!.amount).toBe(13000)
    // Stock is kept when inventory isn't sent
    expect(upd.body.product.variants[0]!.inventory.find((l) => l.locationId === loc)?.stocked).toBe(5)
    expect(upd.body.product.options[0]!.values).toEqual(['S', 'L'])

    // The dropped SKU is free again
    const reuse = await c.post('/api/admin/products', { title: `Reuse ${s}`, variants: [{ sku: `TW-M-${s}`, options: {}, prices: [] }] })
    expect(reuse.status).toBe(200)

    // Delete (admin only)
    const member = await clientWithRole('member')
    expect((await member.delete(`/api/admin/products/${p.id}`)).status).toBe(403)
    expect((await c.delete(`/api/admin/products/${p.id}`)).status).toBe(200)
    expect((await c.get(`/api/admin/products/${p.id}`)).status).toBe(404)
  })

  it('generates a default variant when none are given', async () => {
    const c = await adminClient()
    const res = await c.post<{ product: Product }>('/api/admin/products', { title: `Plain ${suffix()}` })
    expect(res.body.product.variants).toHaveLength(1)
    expect(res.body.product.variants[0]!.title).toBe('Default')
    expect(res.body.product.status).toBe('draft')
  })

  it('rejects duplicate handles, duplicate SKUs and mismatched variant options', async () => {
    const c = await adminClient()
    const dupHandle = await c.post('/api/admin/products', { title: 'Anything', handle: 'kente-weave-tote' })
    expect(dupHandle.status).toBe(409)
    const dupSku = await c.post('/api/admin/products', { title: `Dup ${suffix()}`, variants: [{ sku: 'KWT-GOLD', options: {}, prices: [] }] })
    expect(dupSku.status).toBe(409)
    const badOpts = await c.post<{ code: string }>('/api/admin/products', {
      title: 'Bad',
      options: [{ title: 'Size', values: ['S'] }],
      variants: [{ options: { Size: 'XL' }, prices: [] }],
    })
    expect(badOpts.status).toBe(400)
    expect(badOpts.body.code).toBe('validation_error')
    const fractional = await c.post('/api/admin/products', { title: 'Bad price', variants: [{ options: {}, prices: [{ amount: 10.5, currencyCode: 'GHS' }] }] })
    expect(fractional.status).toBe(400)
  })

  it('manages collections and categories, refusing category cycles', async () => {
    const c = await adminClient()
    const s = suffix()
    const col = await c.post<{ collection: { id: string; handle: string } }>('/api/admin/collections', { title: `Rainy Season ${s}` })
    expect(col.body.collection.handle).toBe(`rainy-season-${s}`)
    expect((await c.delete(`/api/admin/collections/${col.body.collection.id}`)).status).toBe(200)

    const parent = await c.post<{ category: { id: string } }>('/api/admin/categories', { name: `Parent ${s}` })
    const child = await c.post<{ category: { id: string } }>('/api/admin/categories', { name: `Child ${s}`, parentId: parent.body.category.id })
    const cycle = await c.post(`/api/admin/categories/${parent.body.category.id}`, { name: `Parent ${s}`, parentId: child.body.category.id })
    expect(cycle.status).toBe(400)
    expect((await c.delete(`/api/admin/categories/${parent.body.category.id}`)).status).toBe(200)
  })
})

describe.skipIf(!hasServer)('uploads', () => {
  async function upload(bytes: Uint8Array, name: string, type: string) {
    const c = await adminClient()
    const body = new FormData()
    body.append('files', new Blob([bytes], { type }), name)
    return c.request<{ files?: { url: string; contentType: string }[]; code?: string }>('POST', '/api/admin/uploads', body)
  }

  it('accepts a real PNG (identified by magic bytes)', async () => {
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
    const res = await upload(png, 'dot.png', 'image/png')
    expect(res.status).toBe(200)
    expect(res.body.files?.[0]?.contentType).toBe('image/png')
  })

  it('rejects a non-image even when it claims to be one', async () => {
    const res = await upload(new TextEncoder().encode('<script>alert(1)</script>'), 'evil.png', 'image/png')
    expect(res.status).toBe(415)
    expect(res.body.code).toBe('unsupported_media_type')
  })
})
