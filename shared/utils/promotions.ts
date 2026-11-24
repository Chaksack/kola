import { formatMoney } from './money'

export interface PromotionSummaryInput {
  type: 'standard' | 'buyget'
  applicationType: 'percentage' | 'fixed'
  value: number
  currencyCode: string | null
  targetType: 'items' | 'shipping' | 'order'
  allocation: 'each' | 'across'
  buyQuantity?: number | null
  applyToQuantity?: number | null
}

/** Human summary: "10% off the order", "GH₵5.00 off each item", "Free shipping", "Buy 2, get 1 free". */
export function describePromotion(p: PromotionSummaryInput): string {
  const amount = p.applicationType === 'percentage' ? `${(p.value / 100).toLocaleString('en', { maximumFractionDigits: 2 })}%` : formatMoney(p.value, p.currencyCode ?? 'GHS')
  if (p.type === 'buyget') {
    const what = p.applicationType === 'percentage' && p.value >= 10_000 ? 'free' : `${amount} off`
    return `Buy ${p.buyQuantity ?? 1}, get ${p.applyToQuantity ?? 1} ${what}`
  }
  if (p.targetType === 'shipping') return p.applicationType === 'percentage' && p.value >= 10_000 ? 'Free shipping' : `${amount} off shipping`
  if (p.targetType === 'items') return `${amount} off ${p.allocation === 'each' ? 'each eligible item' : 'eligible items'}`
  return `${amount} off the order`
}
