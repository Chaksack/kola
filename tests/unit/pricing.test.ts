import { describe, expect, it } from 'vitest'
import { pickPrice, type PriceCandidate } from '../../server/services/pricing'

const NOW = new Date('2026-11-24T12:00:00Z')
const base = (amount: number, over: Partial<PriceCandidate> = {}): PriceCandidate => ({ amount, currencyCode: 'GHS', regionId: null, minQuantity: null, maxQuantity: null, priceList: null, ...over })
const list = (amount: number, type: 'sale' | 'override', over: Partial<NonNullable<PriceCandidate['priceList']>> = {}, price: Partial<PriceCandidate> = {}): PriceCandidate =>
  base(amount, { ...price, priceList: { id: `pl_${type}`, type, status: 'active', startsAt: null, endsAt: null, customerGroupIds: [], ...over } })
const ctx = { regionId: 'reg_gh', currencyCode: 'GHS', now: NOW }

describe('pickPrice', () => {
  it('uses the base price in the region currency', () => {
    expect(pickPrice([base(45000), base(3900, { currencyCode: 'USD' })], ctx)).toMatchObject({ amount: 45000, originalAmount: 45000, priceListId: null })
  })
  it('returns null when there is no price in the currency', () => {
    expect(pickPrice([base(3900, { currencyCode: 'USD' })], ctx)).toBeNull()
  })
  it('prefers a region-specific price', () => {
    expect(pickPrice([base(45000), base(42000, { regionId: 'reg_gh' }), base(1, { regionId: 'reg_other' })], ctx)?.amount).toBe(42000)
  })
  it('applies quantity tiers', () => {
    const tiers = [base(1000), base(900, { minQuantity: 10 }), base(800, { minQuantity: 50 })]
    expect(pickPrice(tiers, { ...ctx, quantity: 1 })?.amount).toBe(1000)
    expect(pickPrice(tiers, { ...ctx, quantity: 12 })?.amount).toBe(900)
    expect(pickPrice(tiers, { ...ctx, quantity: 60 })?.amount).toBe(800)
  })
  it('a sale list wins only when cheaper and keeps the original for strike-through', () => {
    expect(pickPrice([base(52000), list(44200, 'sale')], ctx)).toMatchObject({ amount: 44200, originalAmount: 52000, priceListType: 'sale' })
    expect(pickPrice([base(52000), list(60000, 'sale')], ctx)).toMatchObject({ amount: 52000, priceListId: null })
  })
  it('an override list replaces the base even when more expensive', () => {
    expect(pickPrice([base(52000), list(55000, 'override')], ctx)).toMatchObject({ amount: 55000, priceListType: 'override' })
  })
  it('ignores draft, future, expired and other-group price lists', () => {
    const candidates = [
      base(52000),
      list(1000, 'sale', { status: 'draft', id: 'a' }),
      list(1000, 'sale', { startsAt: new Date('2027-01-01'), id: 'b' }),
      list(1000, 'sale', { endsAt: new Date('2026-01-01'), id: 'c' }),
      list(1000, 'sale', { customerGroupIds: ['wholesale'], id: 'd' }),
    ]
    expect(pickPrice(candidates, ctx)?.amount).toBe(52000)
    expect(pickPrice(candidates, { ...ctx, customerGroupIds: ['wholesale'] })?.amount).toBe(1000)
  })
})
