/** Pure derivations of order statuses from quantities and money. Every order action uses these. */
import type { FulfillmentStatus, PaymentStatus } from '../db/schema'

export interface ItemQuantities {
  quantity: number
  fulfilledQuantity: number
  shippedQuantity: number
  deliveredQuantity: number
  returnedQuantity: number
  requiresShipping: boolean
}

export function deriveFulfillmentStatus(items: ItemQuantities[], canceled = false): FulfillmentStatus {
  if (canceled) return 'canceled'
  const lines = items.filter((i) => i.requiresShipping && i.quantity > 0)
  if (!lines.length) return items.length ? 'delivered' : 'not_fulfilled'
  const total = lines.reduce((a, i) => a + i.quantity, 0)
  const sum = (k: 'fulfilledQuantity' | 'shippedQuantity' | 'deliveredQuantity') => lines.reduce((a, i) => a + i[k], 0)
  const fulfilled = sum('fulfilledQuantity')
  const shipped = sum('shippedQuantity')
  const delivered = sum('deliveredQuantity')
  if (delivered >= total) return 'delivered'
  if (delivered > 0) return 'partially_delivered'
  if (shipped >= total) return 'shipped'
  if (shipped > 0) return 'partially_shipped'
  if (fulfilled >= total) return 'fulfilled'
  if (fulfilled > 0) return 'partially_fulfilled'
  return 'not_fulfilled'
}

export interface PaymentAmounts {
  total: number
  authorized: number
  captured: number
  refunded: number
  /** Cash on delivery: nothing authorized online, waiting for money. */
  awaitingManual?: boolean
  canceled?: boolean
}

export function derivePaymentStatus(p: PaymentAmounts): PaymentStatus {
  if (p.refunded > 0 && p.refunded >= p.captured && p.captured > 0) return 'refunded'
  if (p.refunded > 0) return 'partially_refunded'
  if (p.canceled && p.captured === 0) return 'canceled'
  if (p.captured > 0 && p.captured >= p.total) return 'captured'
  if (p.captured > 0) return 'partially_captured'
  if (p.authorized > 0) return 'authorized'
  if (p.awaitingManual) return 'awaiting'
  return 'not_paid'
}
