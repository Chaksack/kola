import { describe, expect, it } from 'vitest'
import { eq, isNull } from 'drizzle-orm'
import * as t from '../../server/db/schema'
import { computeTotals } from '../../server/services/totals'
import { db, hasDb } from './helpers'

describe.skipIf(!hasDb)('seeded database', () => {
  it('has the Kola Market store with four regions', async () => {
    const [store] = await db().select().from(t.store)
    expect(store?.name).toBe('Kola Market')
    const regions = await db().select({ name: t.region.name, currency: t.region.currencyCode }).from(t.region).where(isNull(t.region.deletedAt))
    expect(regions.map((r) => r.name)).toEqual(expect.arrayContaining(['Ghana', 'West Africa', 'Europe', 'United Kingdom']))
  })

  it('stores order totals that match the totals engine', async () => {
    const orders = await db().query.order.findMany({ with: { items: true, shippingMethods: true }, limit: 20 })
    expect(orders.length).toBeGreaterThan(10)
    for (const o of orders) {
      const totals = computeTotals({
        items: o.items.map((i) => ({ id: i.id, unitPrice: i.unitPrice, quantity: i.quantity, taxRateBps: i.taxRateBps, isTaxInclusive: i.isTaxInclusive, discount: i.discountTotal })),
        shippingMethods: o.shippingMethods.map((s) => ({ id: s.id, amount: s.amount, taxRateBps: o.items[0]?.taxRateBps ?? 0, isTaxInclusive: o.isTaxInclusive })),
      })
      expect(totals.total, `order ${o.displayId}`).toBe(o.total)
      expect(Number.isInteger(o.total)).toBe(true)
    }
  })

  it('has the HARMATTAN10 promotion at 10%', async () => {
    const [promo] = await db().select().from(t.promotion).where(eq(t.promotion.code, 'HARMATTAN10'))
    expect(promo).toMatchObject({ applicationType: 'percentage', value: 1000, status: 'active' })
  })
})
