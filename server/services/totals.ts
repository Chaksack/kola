/**
 * Totals engine. One pure function turns lines, shipping methods and pre-computed discount
 * adjustments into every total the cart and order need, in integer minor units.
 *
 * Conventions:
 * - `unitPrice` and shipping `amount` are what the customer sees. When `isTaxInclusive` they already
 *   contain tax; otherwise tax is added on top.
 * - Discounts reduce the gross line amount and never take a line below zero.
 * - Tax is computed per line on the discounted amount and rounded half away from zero, so the
 *   result is deterministic and order totals are exact sums of line totals.
 * - `subtotal` = items + shipping before discounts; `itemSubtotal` is items only.
 */
import { applyBps, assertMinor, inclusiveTax, sumMinor } from '../../shared/utils/money'

export interface TotalsLineInput {
  id: string
  unitPrice: number
  quantity: number
  /** Basis points: 1500 = 15%. */
  taxRateBps: number
  isTaxInclusive: boolean
  /** Sum of discount adjustments allocated to this line (minor units, ≥ 0). */
  discount?: number
}

export interface TotalsShippingInput {
  id: string
  amount: number
  taxRateBps: number
  isTaxInclusive: boolean
  discount?: number
}

export interface TotalsInput {
  items: TotalsLineInput[]
  shippingMethods?: TotalsShippingInput[]
  /** Gift card balance to apply against the grand total (minor units). */
  giftCardBalance?: number
}

export interface LineTotals {
  id: string
  /** unitPrice × quantity, as displayed. */
  subtotal: number
  discountTotal: number
  taxTotal: number
  /** Amount the customer pays for this line (tax included). */
  total: number
}

export interface Totals {
  items: LineTotals[]
  shippingMethods: LineTotals[]
  itemSubtotal: number
  shippingSubtotal: number
  subtotal: number
  itemDiscountTotal: number
  shippingDiscountTotal: number
  discountTotal: number
  itemTaxTotal: number
  shippingTaxTotal: number
  taxTotal: number
  itemTotal: number
  shippingTotal: number
  /** Grand total: what the order is worth, tax included. */
  total: number
  giftCardTotal: number
  /** total − gift cards: what a payment provider must collect. */
  amountDue: number
}

function line(id: string, gross: number, rateBps: number, inclusive: boolean, rawDiscount = 0): LineTotals {
  assertMinor(gross, `${id} amount`)
  assertMinor(rawDiscount, `${id} discount`)
  if (gross < 0) throw new RangeError(`${id}: amount must not be negative`)
  if (rawDiscount < 0) throw new RangeError(`${id}: discount must not be negative`)
  if (rateBps < 0 || !Number.isInteger(rateBps)) throw new RangeError(`${id}: invalid tax rate`)
  const discountTotal = Math.min(rawDiscount, gross)
  const taxable = gross - discountTotal
  if (inclusive) {
    return { id, subtotal: gross, discountTotal, taxTotal: inclusiveTax(taxable, rateBps), total: taxable }
  }
  const taxTotal = applyBps(taxable, rateBps)
  return { id, subtotal: gross, discountTotal, taxTotal, total: taxable + taxTotal }
}

export function computeTotals(input: TotalsInput): Totals {
  const items = input.items.map((i) => {
    if (!Number.isInteger(i.quantity) || i.quantity < 0) throw new RangeError(`${i.id}: invalid quantity`)
    return line(i.id, i.unitPrice * i.quantity, i.taxRateBps, i.isTaxInclusive, i.discount)
  })
  const shippingMethods = (input.shippingMethods ?? []).map((s) =>
    line(s.id, s.amount, s.taxRateBps, s.isTaxInclusive, s.discount),
  )

  const itemSubtotal = sumMinor(items.map((l) => l.subtotal))
  const shippingSubtotal = sumMinor(shippingMethods.map((l) => l.subtotal))
  const itemDiscountTotal = sumMinor(items.map((l) => l.discountTotal))
  const shippingDiscountTotal = sumMinor(shippingMethods.map((l) => l.discountTotal))
  const itemTaxTotal = sumMinor(items.map((l) => l.taxTotal))
  const shippingTaxTotal = sumMinor(shippingMethods.map((l) => l.taxTotal))
  const itemTotal = sumMinor(items.map((l) => l.total))
  const shippingTotal = sumMinor(shippingMethods.map((l) => l.total))
  const total = itemTotal + shippingTotal
  const giftCardBalance = input.giftCardBalance ?? 0
  assertMinor(giftCardBalance, 'giftCardBalance')
  const giftCardTotal = Math.max(0, Math.min(giftCardBalance, total))

  return {
    items,
    shippingMethods,
    itemSubtotal,
    shippingSubtotal,
    subtotal: itemSubtotal + shippingSubtotal,
    itemDiscountTotal,
    shippingDiscountTotal,
    discountTotal: itemDiscountTotal + shippingDiscountTotal,
    itemTaxTotal,
    shippingTaxTotal,
    taxTotal: itemTaxTotal + shippingTaxTotal,
    itemTotal,
    shippingTotal,
    total,
    giftCardTotal,
    amountDue: total - giftCardTotal,
  }
}
