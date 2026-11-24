/**
 * Promotion engine. A pure function: given promotions, cart lines and context, it decides which
 * promotions apply and how much each takes off every line and shipping method, in minor units.
 *
 * Order of application: automatic promotions first, then codes in the order they were added. Each
 * promotion discounts what is left after earlier ones, so a line never goes below zero. At most one
 * non-stackable promotion applies; stackable ones combine with anything.
 */
import { allocate, applyBps } from '../../shared/utils/money'

export interface PromoLine {
  id: string
  productId: string
  variantId: string
  collectionId: string | null
  categoryIds: string[]
  productTypeId: string | null
  unitPrice: number
  quantity: number
  isDiscountable: boolean
}

export interface PromoShipping {
  id: string
  amount: number
}

export interface PromoContext {
  regionId: string
  currencyCode: string
  customerGroupIds: string[]
  shippingMethods: PromoShipping[]
  now: Date
}

export type RuleAttribute = 'product' | 'collection' | 'category' | 'product_type' | 'customer_group' | 'region' | 'currency' | 'min_subtotal'

export interface PromoRule {
  ruleType: 'condition' | 'target' | 'buy'
  attribute: RuleAttribute
  operator: 'in' | 'eq' | 'gte' | 'lte'
  values: string[]
}

export interface PromotionDef {
  id: string
  code: string
  type: 'standard' | 'buyget'
  isAutomatic: boolean
  status: 'draft' | 'active' | 'inactive'
  applicationType: 'percentage' | 'fixed'
  /** percentage: basis points; fixed: minor units */
  value: number
  currencyCode: string | null
  targetType: 'items' | 'shipping' | 'order'
  allocation: 'each' | 'across'
  maxQuantity: number | null
  buyQuantity: number | null
  applyToQuantity: number | null
  stackable: boolean
  usageLimit: number | null
  usageCount: number
  startsAt: Date | null
  endsAt: Date | null
  rules: PromoRule[]
  campaign?: {
    startsAt: Date | null
    endsAt: Date | null
    budgetType: 'spend' | 'usage' | null
    budgetLimit: number | null
    budgetUsed: number
    budgetCurrencyCode: string | null
  } | null
}

export type RejectReason =
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'usage_limit_reached'
  | 'budget_exhausted'
  | 'currency_mismatch'
  | 'conditions_not_met'
  | 'no_eligible_items'
  | 'not_combinable'

export interface AppliedPromotion {
  promotionId: string
  code: string
  amount: number
  items: Record<string, number>
  shipping: Record<string, number>
}

export interface PromotionResult {
  applied: AppliedPromotion[]
  rejected: { promotionId: string; code: string; reason: RejectReason }[]
  itemDiscounts: Record<string, number>
  shippingDiscounts: Record<string, number>
  discountTotal: number
}

export const REJECT_MESSAGES: Record<RejectReason, string> = {
  inactive: 'This code is not active',
  not_started: "This code isn't valid yet",
  expired: 'This code has expired',
  usage_limit_reached: 'This code has been fully redeemed',
  budget_exhausted: 'This code has been fully redeemed',
  currency_mismatch: "This code can't be used in your currency",
  conditions_not_met: "Your cart doesn't qualify for this code",
  no_eligible_items: 'None of the items in your cart qualify for this code',
  not_combinable: "This code can't be combined with another discount in your cart",
}

function lineMatches(line: PromoLine, rule: PromoRule): boolean {
  switch (rule.attribute) {
    case 'product':
      return rule.values.includes(line.productId) || rule.values.includes(line.variantId)
    case 'collection':
      return line.collectionId !== null && rule.values.includes(line.collectionId)
    case 'category':
      return line.categoryIds.some((c) => rule.values.includes(c))
    case 'product_type':
      return line.productTypeId !== null && rule.values.includes(line.productTypeId)
    default:
      return true
  }
}

const ITEM_ATTRIBUTES = new Set<RuleAttribute>(['product', 'collection', 'category', 'product_type'])

function conditionsMet(p: PromotionDef, lines: PromoLine[], ctx: PromoContext, itemSubtotal: number): boolean {
  return p.rules
    .filter((r) => r.ruleType === 'condition')
    .every((r) => {
      switch (r.attribute) {
        case 'region':
          return r.values.includes(ctx.regionId)
        case 'currency':
          return r.values.map((v) => v.toUpperCase()).includes(ctx.currencyCode)
        case 'customer_group':
          return ctx.customerGroupIds.some((g) => r.values.includes(g))
        case 'min_subtotal': {
          const min = Number(r.values[0] ?? 0)
          return r.operator === 'lte' ? itemSubtotal <= min : itemSubtotal >= min
        }
        default:
          return lines.some((l) => lineMatches(l, r))
      }
    })
}

function eligibility(p: PromotionDef, ctx: PromoContext): RejectReason | null {
  if (p.status !== 'active') return 'inactive'
  const starts = [p.startsAt, p.campaign?.startsAt].filter((d): d is Date => Boolean(d))
  const ends = [p.endsAt, p.campaign?.endsAt].filter((d): d is Date => Boolean(d))
  if (starts.some((d) => d > ctx.now)) return 'not_started'
  if (ends.some((d) => d < ctx.now)) return 'expired'
  if (p.usageLimit !== null && p.usageCount >= p.usageLimit) return 'usage_limit_reached'
  const c = p.campaign
  if (c?.budgetType && c.budgetLimit !== null && c.budgetUsed >= c.budgetLimit) return 'budget_exhausted'
  if (p.applicationType === 'fixed' && p.currencyCode && p.currencyCode.toUpperCase() !== ctx.currencyCode) return 'currency_mismatch'
  return null
}

/** Spread `amount` over the given remaining balances proportionally, never exceeding any balance. */
function spread(amount: number, keys: string[], remaining: Record<string, number>): Record<string, number> {
  const balances = keys.map((k) => remaining[k] ?? 0)
  const total = balances.reduce((a, b) => a + b, 0)
  const capped = Math.min(amount, total)
  if (capped <= 0) return {}
  const parts = allocate(capped, balances)
  return Object.fromEntries(keys.map((k, i) => [k, parts[i]!]).filter(([, v]) => (v as number) > 0))
}

/** How much promotion `p` takes off each line and shipping method, given what's left on them. */
function computeAdjustments(
  p: PromotionDef,
  lines: PromoLine[],
  ctx: PromoContext,
  remaining: Record<string, number>,
  shipRemaining: Record<string, number>,
): { items: Record<string, number>; shipping: Record<string, number> } {
  const targetRules = p.rules.filter((r) => r.ruleType === 'target' && ITEM_ATTRIBUTES.has(r.attribute))
  const targets = lines.filter((l) => l.isDiscountable && (remaining[l.id] ?? 0) > 0 && targetRules.every((r) => lineMatches(l, r)))
  let items: Record<string, number> = {}
  let shipping: Record<string, number> = {}

  if (p.targetType === 'shipping') {
    const keys = ctx.shippingMethods.map((s) => s.id).filter((k) => (shipRemaining[k] ?? 0) > 0)
    if (p.applicationType === 'percentage') {
      shipping = Object.fromEntries(keys.map((k) => [k, Math.min(shipRemaining[k]!, applyBps(shipRemaining[k]!, p.value))]))
    } else {
      shipping = spread(p.value, keys, shipRemaining)
    }
  } else if (p.type === 'buyget') {
    const buyRules = p.rules.filter((r) => r.ruleType === 'buy')
    const buyQty = lines.filter((l) => buyRules.every((r) => lineMatches(l, r))).reduce((a, l) => a + l.quantity, 0)
    if (buyQty >= (p.buyQuantity ?? 1)) {
      // Discount the cheapest eligible units first.
      let units = p.applyToQuantity ?? 1
      for (const l of [...targets].sort((a, b) => a.unitPrice - b.unitPrice)) {
        if (units <= 0) break
        const take = Math.min(units, l.quantity)
        const off = p.applicationType === 'percentage' ? applyBps(l.unitPrice * take, p.value) : Math.min(p.value, l.unitPrice) * take
        items[l.id] = Math.min(off, remaining[l.id]!)
        units -= take
      }
    }
  } else {
    const eligibleLines = p.targetType === 'order' ? lines.filter((l) => l.isDiscountable && (remaining[l.id] ?? 0) > 0) : targets
    if (p.applicationType === 'percentage') {
      if (p.allocation === 'each' && p.maxQuantity) {
        for (const l of eligibleLines) {
          const qty = Math.min(l.quantity, p.maxQuantity)
          items[l.id] = Math.min(remaining[l.id]!, applyBps(Math.round((remaining[l.id]! * qty) / l.quantity), p.value))
        }
      } else {
        const base = eligibleLines.reduce((a, l) => a + remaining[l.id]!, 0)
        items = spread(applyBps(base, p.value), eligibleLines.map((l) => l.id), remaining)
      }
    } else if (p.allocation === 'each') {
      for (const l of eligibleLines) {
        const qty = p.maxQuantity ? Math.min(l.quantity, p.maxQuantity) : l.quantity
        items[l.id] = Math.min(remaining[l.id]!, p.value * qty)
      }
    } else {
      items = spread(p.value, eligibleLines.map((l) => l.id), remaining)
    }
  }
  return { items, shipping }
}

export function applyPromotions(promotions: PromotionDef[], lines: PromoLine[], ctx: PromoContext): PromotionResult {
  const remaining: Record<string, number> = Object.fromEntries(lines.map((l) => [l.id, l.isDiscountable ? l.unitPrice * l.quantity : 0]))
  const shipRemaining: Record<string, number> = Object.fromEntries(ctx.shippingMethods.map((s) => [s.id, s.amount]))
  const itemSubtotal = lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0)
  const result: PromotionResult = { applied: [], rejected: [], itemDiscounts: {}, shippingDiscounts: {}, discountTotal: 0 }
  let nonStackableApplied = false

  const ordered = [...promotions.filter((p) => p.isAutomatic), ...promotions.filter((p) => !p.isAutomatic)]
  const seen = new Set<string>()

  for (const p of ordered) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    const reject = (reason: RejectReason) => result.rejected.push({ promotionId: p.id, code: p.code, reason })

    const ineligible = eligibility(p, ctx)
    if (ineligible) {
      reject(ineligible)
      continue
    }
    if (!conditionsMet(p, lines, ctx, itemSubtotal)) {
      reject('conditions_not_met')
      continue
    }
    if (!p.stackable && nonStackableApplied) {
      reject('not_combinable')
      continue
    }

    let { items, shipping } = computeAdjustments(p, lines, ctx, remaining, shipRemaining)

    // Campaign spend budget caps the amount this promotion may give.
    let amount = Object.values(items).reduce((a, b) => a + b, 0) + Object.values(shipping).reduce((a, b) => a + b, 0)
    const c = p.campaign
    if (c?.budgetType === 'spend' && c.budgetLimit !== null && (!c.budgetCurrencyCode || c.budgetCurrencyCode.toUpperCase() === ctx.currencyCode)) {
      const left = Math.max(0, c.budgetLimit - c.budgetUsed)
      if (amount > left) {
        // Shrink every adjustment proportionally so the total equals what's left in the budget.
        const entries = [...Object.entries(items).map(([k, v]) => ['i', k, v] as const), ...Object.entries(shipping).map(([k, v]) => ['s', k, v] as const)]
        const parts = allocate(left, entries.map(([, , v]) => v))
        items = {}
        shipping = {}
        entries.forEach(([kind, k], i) => {
          if (parts[i]! > 0) (kind === 'i' ? items : shipping)[k] = parts[i]!
        })
        amount = left
      }
    }

    if (amount <= 0) {
      reject('no_eligible_items')
      continue
    }
    for (const [k, v] of Object.entries(items)) {
      remaining[k] = remaining[k]! - v
      result.itemDiscounts[k] = (result.itemDiscounts[k] ?? 0) + v
    }
    for (const [k, v] of Object.entries(shipping)) {
      shipRemaining[k] = shipRemaining[k]! - v
      result.shippingDiscounts[k] = (result.shippingDiscounts[k] ?? 0) + v
    }
    result.applied.push({ promotionId: p.id, code: p.code, amount, items, shipping })
    result.discountTotal += amount
    if (!p.stackable) nonStackableApplied = true
  }
  return result
}
