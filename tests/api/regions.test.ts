import { describe, expect, it } from 'vitest'
import { hasServer } from './client'
import { adminClient, clientWithRole } from './helpers'

interface Region {
  id: string
  name: string
  currencyCode: string
  countries: { iso2: string }[]
  paymentProviders: string[]
  taxRates: { id: string; rateBps: number; isDefault: boolean }[]
}

describe.skipIf(!hasServer)('regions and taxes', () => {
  it('creates a region with countries, providers and a default tax rate', async () => {
    const c = await adminClient()
    const res = await c.post<{ region: { id: string } }>('/api/admin/regions', {
      name: 'East Africa',
      currencyCode: 'usd',
      countries: ['KE', 'tz'],
      paymentProviders: ['stripe', 'manual'],
      defaultTaxRate: { name: 'VAT', code: 'VAT', rateBps: 1600 },
    })
    expect(res.status).toBe(200)
    const list = await c.get<{ data: Region[] }>('/api/admin/regions')
    const r = list.body.data.find((x) => x.id === res.body.region.id)!
    expect(r.currencyCode).toBe('USD')
    expect(r.countries.map((x) => x.iso2).sort()).toEqual(['ke', 'tz'])
    expect(r.paymentProviders.sort()).toEqual(['manual', 'stripe'])
    expect(r.taxRates[0]).toMatchObject({ rateBps: 1600, isDefault: true })

    // A second default rate replaces the first as default
    await c.post(`/api/admin/regions/${r.id}/tax-rates`, { name: 'VAT reduced', code: 'VAT_R', rateBps: 800, isDefault: true })
    const after = (await c.get<{ data: Region[] }>('/api/admin/regions')).body.data.find((x) => x.id === r.id)!
    expect(after.taxRates.filter((x) => x.isDefault)).toHaveLength(1)
    expect(after.taxRates.find((x) => x.isDefault)!.rateBps).toBe(800)

    // Countries are exclusive to one region
    const clash = await c.post('/api/admin/regions', { name: 'Clash', currencyCode: 'USD', countries: ['ke'] })
    expect(clash.status).toBe(409)

    // Deleting releases its countries
    expect((await c.delete(`/api/admin/regions/${r.id}`)).status).toBe(200)
    const countries = await c.get<{ data: { iso2: string; regionId: string | null }[] }>('/api/admin/countries')
    expect(countries.body.data.find((x) => x.iso2 === 'ke')?.regionId).toBeNull()
  })

  it('rejects unknown countries and currencies, and protects the default region', async () => {
    const c = await adminClient()
    expect((await c.post('/api/admin/regions', { name: 'X', currencyCode: 'USD', countries: ['zz'] })).status).toBe(400)
    expect((await c.post('/api/admin/regions', { name: 'X', currencyCode: 'JPY' })).status).toBe(400)
    const store = await c.get<{ store: { defaultRegionId: string } }>('/api/admin/store')
    expect((await c.delete(`/api/admin/regions/${store.body.store.defaultRegionId}`)).status).toBe(409)
  })

  it('members can read but not change regions, channels or the store', async () => {
    const member = await clientWithRole('member')
    expect((await member.get('/api/admin/regions')).status).toBe(200)
    expect((await member.post('/api/admin/regions', { name: 'X', currencyCode: 'USD' })).status).toBe(403)
    expect((await member.post('/api/admin/sales-channels', { name: 'X' })).status).toBe(403)
    expect((await member.post('/api/admin/store', { name: 'X', defaultCurrencyCode: 'GHS', currencies: ['GHS'] })).status).toBe(403)
  })
})

describe.skipIf(!hasServer)('sales channels', () => {
  it('creates, disables and deletes a channel; the default channel is protected', async () => {
    const c = await adminClient()
    const created = await c.post<{ salesChannel: { id: string } }>('/api/admin/sales-channels', { name: 'Pop-up · Labadi' })
    const id = created.body.salesChannel.id
    const disabled = await c.post<{ salesChannel: { isDisabled: boolean } }>(`/api/admin/sales-channels/${id}`, { name: 'Pop-up · Labadi', isDisabled: true })
    expect(disabled.body.salesChannel.isDisabled).toBe(true)
    expect((await c.delete(`/api/admin/sales-channels/${id}`)).status).toBe(200)

    const store = await c.get<{ store: { defaultSalesChannelId: string } }>('/api/admin/store')
    const def = store.body.store.defaultSalesChannelId
    expect((await c.post(`/api/admin/sales-channels/${def}`, { name: 'Web store', isDisabled: true })).status).toBe(409)
    expect((await c.delete(`/api/admin/sales-channels/${def}`)).status).toBe(409)
  })
})
