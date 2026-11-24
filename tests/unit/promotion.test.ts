import { describe, expect, it } from 'vitest'
import { applyPromotions, type PromoContext, type PromoLine, type PromotionDef } from '../../server/services/promotion'

const NOW = new Date('2026-11-24T12:00:00Z')

function promo(over: Partial<PromotionDef> = {}): PromotionDef {
  return {
    id: over.code ?? 'p1',
    code: 'CODE',
    type: 'standard',
    isAutomatic: false,
    status: 'active',
    applicationType: 'percentage',
    value: 1000,
    currencyCode: null,
    targetType: 'order',
    allocation: 'across',
    maxQuantity: null,
    buyQuantity: null,
    applyToQuantity: null,
    stackable: false,
    usageLimit: null,
    usageCount: 0,
    startsAt: null,
    endsAt: null,
    rules: [],
    campaign: null,
    ...over,
  }
}

function line(id: string, unitPrice: number, quantity = 1, over: Partial<PromoLine> = {}): PromoLine {
  return { id, productId: `prod_${id}`, variantId: `var_${id}`, collectionId: null, categoryIds: [], productTypeId: null, unitPrice, quantity, isDiscountable: true, ...over }
}

const ctx = (over: Partial<PromoContext> = {}): PromoContext => ({ regionId: 'reg_gh', currencyCode: 'GHS', customerGroupIds: [], shippingMethods: [], now: NOW, ...over })

describe('applyPromotions', () => {
  it('HARMATTAN10: 10% off the order, allocated across lines so parts sum exactly', () => {
    const r = applyPromotions([promo({ code: 'HARMATTAN10' })], [line('a', 45000), line('b', 12000, 2)], ctx())
    expect(r.discountTotal).toBe(6900)
    expect(r.itemDiscounts).toEqual({ a: 4500, b: 2400 })
    expect(r.rejected).toEqual([])
  })

  it('rounds percentage discounts deterministically', () => {
    const r = applyPromotions([promo()], [line('a', 333), line('b', 333), line('c', 333)], ctx())
    expect(r.discountTotal).toBe(100)
    expect(Object.values(r.itemDiscounts).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('fixed amount across is capped at the cart value', () => {
    const r = applyPromotions([promo({ applicationType: 'fixed', value: 50000, currencyCode: 'GHS' })], [line('a', 10000), line('b', 20000)], ctx())
    expect(r.discountTotal).toBe(30000)
  })

  it('fixed amount each applies per unit, honouring maxQuantity', () => {
    const p = promo({ applicationType: 'fixed', value: 500, currencyCode: 'GHS', targetType: 'items', allocation: 'each', maxQuantity: 2 })
    const r = applyPromotions([p], [line('a', 3000, 5)], ctx())
    expect(r.itemDiscounts.a).toBe(1000)
  })

  it('targets only matching items', () => {
    const p = promo({ targetType: 'items', value: 2000, rules: [{ ruleType: 'target', attribute: 'collection', operator: 'in', values: ['col_harmattan'] }] })
    const r = applyPromotions([p], [line('a', 10000, 1, { collectionId: 'col_harmattan' }), line('b', 10000)], ctx())
    expect(r.itemDiscounts).toEqual({ a: 2000 })
  })

  it('skips non-discountable lines such as gift cards', () => {
    const r = applyPromotions([promo()], [line('gift', 25000, 1, { isDiscountable: false }), line('a', 10000)], ctx())
    expect(r.itemDiscounts).toEqual({ a: 1000 })
  })

  it('free shipping discounts shipping methods only', () => {
    const p = promo({ targetType: 'shipping', value: 10000 })
    const r = applyPromotions([p], [line('a', 10000)], ctx({ shippingMethods: [{ id: 's', amount: 3000 }] }))
    expect(r.shippingDiscounts).toEqual({ s: 3000 })
    expect(r.itemDiscounts).toEqual({})
  })

  it('buy 2 get 1 free discounts the cheapest unit', () => {
    const p = promo({ type: 'buyget', targetType: 'items', value: 10000, buyQuantity: 2, applyToQuantity: 1 })
    const r = applyPromotions([p], [line('a', 12000), line('b', 9500), line('c', 17000)], ctx())
    expect(r.itemDiscounts).toEqual({ b: 9500 })
    const notEnough = applyPromotions([p], [line('a', 12000)], ctx())
    expect(notEnough.rejected[0]?.reason).toBe('no_eligible_items')
  })

  it.each([
    [promo({ status: 'draft' }), 'inactive'],
    [promo({ startsAt: new Date('2027-01-01') }), 'not_started'],
    [promo({ endsAt: new Date('2026-01-01') }), 'expired'],
    [promo({ usageLimit: 5, usageCount: 5 }), 'usage_limit_reached'],
    [promo({ campaign: { startsAt: null, endsAt: null, budgetType: 'usage', budgetLimit: 10, budgetUsed: 10, budgetCurrencyCode: null } }), 'budget_exhausted'],
    [promo({ applicationType: 'fixed', value: 500, currencyCode: 'USD' }), 'currency_mismatch'],
    [promo({ rules: [{ ruleType: 'condition', attribute: 'min_subtotal', operator: 'gte', values: ['100000'] }] }), 'conditions_not_met'],
    [promo({ rules: [{ ruleType: 'condition', attribute: 'region', operator: 'in', values: ['reg_eu'] }] }), 'conditions_not_met'],
    [promo({ rules: [{ ruleType: 'condition', attribute: 'customer_group', operator: 'in', values: ['vip'] }] }), 'conditions_not_met'],
  ] as const)('rejects %# with %s', (p, reason) => {
    const r = applyPromotions([p], [line('a', 10000)], ctx())
    expect(r.rejected[0]?.reason).toBe(reason)
    expect(r.discountTotal).toBe(0)
  })

  it('accepts customer-group and min-subtotal conditions when met', () => {
    const p = promo({
      rules: [
        { ruleType: 'condition', attribute: 'customer_group', operator: 'in', values: ['vip'] },
        { ruleType: 'condition', attribute: 'min_subtotal', operator: 'gte', values: ['5000'] },
      ],
    })
    expect(applyPromotions([p], [line('a', 10000)], ctx({ customerGroupIds: ['vip'] })).discountTotal).toBe(1000)
  })

  it('allows one non-stackable promotion; stackable ones combine on the remaining amount', () => {
    const a = promo({ code: 'A', value: 1000 })
    const b = promo({ code: 'B', value: 2000 })
    const s = promo({ code: 'S', value: 1000, stackable: true })
    const r = applyPromotions([a, b, s], [line('x', 10000)], ctx())
    expect(r.applied.map((x) => x.code)).toEqual(['A', 'S'])
    expect(r.rejected).toEqual([{ promotionId: 'B', code: 'B', reason: 'not_combinable' }])
    // 10% of 10000 = 1000, then 10% of the remaining 9000 = 900
    expect(r.itemDiscounts.x).toBe(1900)
  })

  it('applies automatic promotions before codes', () => {
    const auto = promo({ code: 'AUTO', isAutomatic: true, stackable: true, applicationType: 'fixed', value: 1000, currencyCode: 'GHS' })
    const code = promo({ code: 'PCT', value: 5000 })
    const r = applyPromotions([code, auto], [line('x', 10000)], ctx())
    expect(r.applied.map((x) => x.code)).toEqual(['AUTO', 'PCT'])
    expect(r.itemDiscounts.x).toBe(1000 + 4500)
  })

  it('caps a promotion at the remaining campaign spend budget', () => {
    const p = promo({ value: 5000, campaign: { startsAt: null, endsAt: null, budgetType: 'spend', budgetLimit: 10000, budgetUsed: 7000, budgetCurrencyCode: 'GHS' } })
    const r = applyPromotions([p], [line('a', 10000), line('b', 10000)], ctx())
    expect(r.discountTotal).toBe(3000)
    expect(r.itemDiscounts.a! + r.itemDiscounts.b!).toBe(3000)
  })

  it('never discounts a line below zero across several promotions', () => {
    const big = promo({ code: 'BIG', applicationType: 'fixed', value: 9000, currencyCode: 'GHS', stackable: true })
    const big2 = promo({ code: 'BIG2', applicationType: 'fixed', value: 9000, currencyCode: 'GHS', stackable: true })
    const r = applyPromotions([big, big2], [line('a', 10000)], ctx())
    expect(r.itemDiscounts.a).toBe(10000)
  })
})
