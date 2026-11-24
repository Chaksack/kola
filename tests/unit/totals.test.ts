import { describe, expect, it } from 'vitest'
import { computeTotals, type TotalsInput } from '../../server/services/totals'

type Case = {
  name: string
  input: TotalsInput
  expect: Partial<ReturnType<typeof computeTotals>>
}

const VAT = 1500

const cases: Case[] = [
  {
    name: 'empty cart',
    input: { items: [] },
    expect: { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0, amountDue: 0 },
  },
  {
    name: 'tax-inclusive GHS line (VAT 15%)',
    input: { items: [{ id: 'a', unitPrice: 11500, quantity: 1, taxRateBps: VAT, isTaxInclusive: true }] },
    expect: { itemSubtotal: 11500, taxTotal: 1500, total: 11500 },
  },
  {
    name: 'tax-exclusive line adds tax on top',
    input: { items: [{ id: 'a', unitPrice: 10000, quantity: 2, taxRateBps: 2000, isTaxInclusive: false }] },
    expect: { itemSubtotal: 20000, taxTotal: 4000, total: 24000 },
  },
  {
    name: 'inclusive with 10% discount reduces taxable base',
    input: {
      items: [{ id: 'a', unitPrice: 23000, quantity: 1, taxRateBps: VAT, isTaxInclusive: true, discount: 2300 }],
    },
    expect: { itemSubtotal: 23000, discountTotal: 2300, taxTotal: 2700, total: 20700 },
  },
  {
    name: 'exclusive with discount',
    input: {
      items: [{ id: 'a', unitPrice: 5000, quantity: 3, taxRateBps: 2000, isTaxInclusive: false, discount: 1500 }],
    },
    expect: { itemSubtotal: 15000, discountTotal: 1500, taxTotal: 2700, total: 16200 },
  },
  {
    name: 'discount larger than line is capped',
    input: { items: [{ id: 'a', unitPrice: 1000, quantity: 1, taxRateBps: 0, isTaxInclusive: false, discount: 5000 }] },
    expect: { discountTotal: 1000, total: 0 },
  },
  {
    name: 'shipping is taxed and included in total',
    input: {
      items: [{ id: 'a', unitPrice: 11500, quantity: 1, taxRateBps: VAT, isTaxInclusive: true }],
      shippingMethods: [{ id: 's', amount: 2300, taxRateBps: VAT, isTaxInclusive: true }],
    },
    expect: { itemSubtotal: 11500, shippingSubtotal: 2300, subtotal: 13800, taxTotal: 1800, shippingTotal: 2300, total: 13800 },
  },
  {
    name: 'free-shipping promotion zeroes shipping',
    input: {
      items: [{ id: 'a', unitPrice: 4000, quantity: 1, taxRateBps: 2000, isTaxInclusive: false }],
      shippingMethods: [{ id: 's', amount: 800, taxRateBps: 2000, isTaxInclusive: false, discount: 800 }],
    },
    expect: { shippingDiscountTotal: 800, shippingTotal: 0, total: 4800 },
  },
  {
    name: 'rounding is per line, half away from zero',
    input: {
      items: [
        { id: 'a', unitPrice: 333, quantity: 1, taxRateBps: 1250, isTaxInclusive: false },
        { id: 'b', unitPrice: 333, quantity: 1, taxRateBps: 1250, isTaxInclusive: false },
        { id: 'c', unitPrice: 333, quantity: 1, taxRateBps: 1250, isTaxInclusive: false },
      ],
    },
    // 333 × 12.5% = 41.625 → 42 per line
    expect: { taxTotal: 126, total: 1125 },
  },
  {
    name: 'gift card covers part of the total',
    input: { items: [{ id: 'a', unitPrice: 10000, quantity: 1, taxRateBps: 0, isTaxInclusive: false }], giftCardBalance: 2500 },
    expect: { total: 10000, giftCardTotal: 2500, amountDue: 7500 },
  },
  {
    name: 'gift card larger than total leaves nothing due',
    input: { items: [{ id: 'a', unitPrice: 1000, quantity: 1, taxRateBps: 0, isTaxInclusive: false }], giftCardBalance: 5000 },
    expect: { giftCardTotal: 1000, amountDue: 0 },
  },
  {
    name: 'zero-decimal currency amounts behave the same',
    input: { items: [{ id: 'a', unitPrice: 5000, quantity: 2, taxRateBps: 1800, isTaxInclusive: false }] },
    expect: { taxTotal: 1800, total: 11800 },
  },
]

describe('computeTotals', () => {
  it.each(cases)('$name', ({ input, expect: expected }) => {
    expect(computeTotals(input)).toMatchObject(expected)
  })

  it('order totals are exact sums of line totals', () => {
    const t = computeTotals({
      items: [
        { id: 'a', unitPrice: 4599, quantity: 3, taxRateBps: VAT, isTaxInclusive: true, discount: 1380 },
        { id: 'b', unitPrice: 12900, quantity: 1, taxRateBps: VAT, isTaxInclusive: true },
      ],
      shippingMethods: [{ id: 's', amount: 2000, taxRateBps: VAT, isTaxInclusive: true }],
    })
    const sum = (k: 'taxTotal' | 'total' | 'discountTotal') =>
      [...t.items, ...t.shippingMethods].reduce((a, l) => a + l[k], 0)
    expect(t.taxTotal).toBe(sum('taxTotal'))
    expect(t.total).toBe(sum('total'))
    expect(t.discountTotal).toBe(sum('discountTotal'))
    expect(t.total).toBe(t.subtotal - t.discountTotal)
  })

  it.each([
    ['fractional price', { id: 'a', unitPrice: 10.5, quantity: 1, taxRateBps: 0, isTaxInclusive: false }],
    ['negative quantity', { id: 'a', unitPrice: 100, quantity: -1, taxRateBps: 0, isTaxInclusive: false }],
    ['negative discount', { id: 'a', unitPrice: 100, quantity: 1, taxRateBps: 0, isTaxInclusive: false, discount: -5 }],
  ])('rejects %s', (_, item) => {
    expect(() => computeTotals({ items: [item] })).toThrow()
  })
})
