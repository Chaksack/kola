import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import * as t from '../../server/db/schema'
import { releaseAt, reserveAnywhere, tryReserveAt } from '../../server/services/inventory'
import { hasServer } from './client'
import { adminClient, clientWithRole, db, hasDb } from './helpers'

async function freshItem(stocked: number) {
  const c = await adminClient()
  const locs = await c.get<{ data: { id: string }[] }>('/api/admin/stock-locations')
  const res = await c.post<{ product: { variants: { inventoryItemId: string }[] } }>('/api/admin/products', {
    title: `Stock test ${Math.random().toString(36).slice(2, 8)}`,
    variants: [{ options: {}, prices: [], inventory: [{ locationId: locs.body.data[0]!.id, stocked }] }],
  })
  return { itemId: res.body.product.variants[0]!.inventoryItemId, locationId: locs.body.data[0]!.id, otherLocationId: locs.body.data[1]?.id }
}

describe.skipIf(!hasServer || !hasDb)('inventory', () => {
  it('concurrent reservations never oversell', async () => {
    const { itemId, locationId } = await freshItem(3)
    const results = await Promise.all(Array.from({ length: 8 }, () => tryReserveAt(db(), itemId, locationId, 1)))
    expect(results.filter(Boolean)).toHaveLength(3)
    const [level] = await db().select().from(t.inventoryLevel).where(and(eq(t.inventoryLevel.inventoryItemId, itemId), eq(t.inventoryLevel.locationId, locationId)))
    expect(level).toMatchObject({ stocked: 3, reserved: 3 })
    await releaseAt(db(), itemId, locationId, 3)
  })

  it('reserveAnywhere falls back to another location and returns null when nothing covers it', async () => {
    const { itemId, locationId, otherLocationId } = await freshItem(1)
    expect(await reserveAnywhere(db(), itemId, 1, otherLocationId)).toBe(locationId)
    expect(await reserveAnywhere(db(), itemId, 1)).toBeNull()
  })

  it('lists, filters and adjusts stock, refusing to go below reserved', async () => {
    const c = await adminClient()
    const { itemId, locationId } = await freshItem(10)
    const list = await c.get<{ data: { id: string; available: number }[] }>('/api/admin/inventory?q=Stock%20test&limit=200')
    expect(list.body.data.some((i) => i.id === itemId)).toBe(true)
    const out = await c.get<{ data: { status: string }[] }>('/api/admin/inventory?status=out_of_stock')
    expect(out.body.data.every((i) => i.status === 'out_of_stock')).toBe(true)

    await tryReserveAt(db(), itemId, locationId, 4)
    const tooLow = await c.post(`/api/admin/inventory/${itemId}`, { levels: [{ locationId, stocked: 2 }] })
    expect(tooLow.status).toBe(409)
    expect(tooLow.body).toMatchObject({ code: 'insufficient_stock' })

    const ok = await c.post<{ levels: { locationId: string; stocked: number; available: number }[] }>(`/api/admin/inventory/${itemId}`, {
      lowStockThreshold: 2,
      levels: [{ locationId, adjustment: 5, incoming: 20 }],
    })
    expect(ok.status).toBe(200)
    expect(ok.body.levels.find((l) => l.locationId === locationId)).toMatchObject({ stocked: 15, available: 11 })
  })
})

describe.skipIf(!hasServer)('locations and shipping setup', () => {
  it('creates a location with a zone and a priced option, then cleans up', async () => {
    const c = await adminClient()
    const loc = await c.post<{ location: { id: string } }>('/api/admin/stock-locations', { name: 'Kumasi depot', address: { city: 'Kumasi', countryCode: 'GH' } })
    expect(loc.status).toBe(200)
    const zone = await c.post<{ serviceZone: { id: string } }>(`/api/admin/stock-locations/${loc.body.location.id}/service-zones`, { name: 'Ashanti', countries: ['GH'] })
    expect(zone.status).toBe(200)
    const profiles = await c.get<{ data: { id: string; type: string }[] }>('/api/admin/shipping-profiles')
    const opt = await c.post<{ shippingOption: { id: string } }>('/api/admin/shipping-options', {
      name: 'Kumasi courier',
      serviceZoneId: zone.body.serviceZone.id,
      shippingProfileId: profiles.body.data.find((p) => p.type === 'default')!.id,
      prices: [{ currencyCode: 'ghs', amount: 2500 }],
    })
    expect(opt.status).toBe(200)
    const setup = await c.get<{ locations: { id: string; serviceZones: { countries: string[]; shippingOptions: { name: string; prices: { amount: number; currencyCode: string }[] }[] }[] }[] }>('/api/admin/fulfillment/setup')
    const created = setup.body.locations.find((l) => l.id === loc.body.location.id)!
    expect(created.serviceZones[0]!.countries).toEqual(['gh'])
    expect(created.serviceZones[0]!.shippingOptions[0]!.prices[0]).toEqual({ amount: 2500, currencyCode: 'GHS', regionId: null })

    expect((await c.delete(`/api/admin/service-zones/${zone.body.serviceZone.id}`)).status).toBe(200)
    expect((await c.delete(`/api/admin/stock-locations/${loc.body.location.id}`)).status).toBe(200)
  })

  it('refuses to delete the default location or one holding stock; members cannot edit setup', async () => {
    const c = await adminClient()
    const setup = await c.get<{ defaultLocationId: string }>('/api/admin/fulfillment/setup')
    const res = await c.delete(`/api/admin/stock-locations/${setup.body.defaultLocationId}`)
    expect(res.status).toBe(409)
    const member = await clientWithRole('member')
    expect((await member.post('/api/admin/stock-locations', { name: 'Nope' })).status).toBe(403)
    expect((await member.get('/api/admin/fulfillment/setup')).status).toBe(200)
  })
})
