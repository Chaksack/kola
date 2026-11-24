import { describe, expect, it } from 'vitest'
import { deriveFulfillmentStatus, derivePaymentStatus, type ItemQuantities } from '../../server/services/order-status'

const item = (q: number, f = 0, s = 0, d = 0, requiresShipping = true): ItemQuantities => ({ quantity: q, fulfilledQuantity: f, shippedQuantity: s, deliveredQuantity: d, returnedQuantity: 0, requiresShipping })

describe('deriveFulfillmentStatus', () => {
  it.each([
    [[item(2)], 'not_fulfilled'],
    [[item(2, 1)], 'partially_fulfilled'],
    [[item(2, 2)], 'fulfilled'],
    [[item(2, 2), item(1)], 'partially_fulfilled'],
    [[item(2, 2, 1)], 'partially_shipped'],
    [[item(2, 2, 2)], 'shipped'],
    [[item(2, 2, 2, 1)], 'partially_delivered'],
    [[item(2, 2, 2, 2)], 'delivered'],
    [[item(1, 0, 0, 0, false)], 'delivered'],
    [[item(1, 0, 0, 0, false), item(1)], 'not_fulfilled'],
  ] as const)('%# → %s', (items, expected) => expect(deriveFulfillmentStatus([...items])).toBe(expected))
  it('canceled wins', () => expect(deriveFulfillmentStatus([item(1, 1)], true)).toBe('canceled'))
})

describe('derivePaymentStatus', () => {
  it.each([
    [{ total: 100, authorized: 0, captured: 0, refunded: 0 }, 'not_paid'],
    [{ total: 100, authorized: 0, captured: 0, refunded: 0, awaitingManual: true }, 'awaiting'],
    [{ total: 100, authorized: 100, captured: 0, refunded: 0 }, 'authorized'],
    [{ total: 100, authorized: 100, captured: 40, refunded: 0 }, 'partially_captured'],
    [{ total: 100, authorized: 100, captured: 100, refunded: 0 }, 'captured'],
    [{ total: 100, authorized: 100, captured: 100, refunded: 30 }, 'partially_refunded'],
    [{ total: 100, authorized: 100, captured: 100, refunded: 100 }, 'refunded'],
    [{ total: 100, authorized: 100, captured: 0, refunded: 0, canceled: true }, 'canceled'],
  ] as const)('%o → %s', (p, expected) => expect(derivePaymentStatus(p)).toBe(expected))
})
