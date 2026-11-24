import { z } from 'zod'
import { emailSchema } from './common'

const date = z.coerce.date().nullish()

export const customerListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(200).optional(),
  groupId: z.string().optional(),
  hasAccount: z.enum(['true', 'false']).optional(),
  order: z.enum(['newest', 'oldest', 'name', 'spent']).default('newest'),
})

export const customerInputSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().max(100).nullish(),
  lastName: z.string().trim().max(100).nullish(),
  phone: z.string().trim().max(32).nullish(),
  groupIds: z.array(z.string()).max(50).default([]),
})

export const groupInputSchema = z.object({ name: z.string().trim().min(1).max(100) })
export const groupMembersSchema = z.object({ add: z.array(z.string()).max(500).default([]), remove: z.array(z.string()).max(500).default([]) })

export const promotionRuleSchema = z.object({
  ruleType: z.enum(['condition', 'target', 'buy']),
  attribute: z.enum(['product', 'collection', 'category', 'product_type', 'customer_group', 'region', 'currency', 'min_subtotal']),
  operator: z.enum(['in', 'eq', 'gte', 'lte']).default('in'),
  values: z.array(z.string().max(100)).min(1).max(200),
})

export const promotionInputSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9_-]+$/, 'Use letters, numbers, dashes and underscores'),
    type: z.enum(['standard', 'buyget']).default('standard'),
    isAutomatic: z.boolean().default(false),
    status: z.enum(['draft', 'active', 'inactive']).default('draft'),
    campaignId: z.string().nullish(),
    applicationType: z.enum(['percentage', 'fixed']),
    /** percentage: basis points; fixed: minor units */
    value: z.number().int().min(1).max(1_000_000_000),
    currencyCode: z.string().trim().toUpperCase().length(3).nullish(),
    targetType: z.enum(['items', 'shipping', 'order']).default('order'),
    allocation: z.enum(['each', 'across']).default('across'),
    maxQuantity: z.number().int().min(1).nullish(),
    buyQuantity: z.number().int().min(1).nullish(),
    applyToQuantity: z.number().int().min(1).nullish(),
    stackable: z.boolean().default(false),
    usageLimit: z.number().int().min(1).nullish(),
    startsAt: date,
    endsAt: date,
    rules: z.array(promotionRuleSchema).max(20).default([]),
  })
  .superRefine((p, ctx) => {
    if (p.applicationType === 'percentage' && p.value > 10_000) ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage can’t exceed 100%' })
    if (p.applicationType === 'fixed' && !p.currencyCode) ctx.addIssue({ code: 'custom', path: ['currencyCode'], message: 'Fixed amounts need a currency' })
    if (p.type === 'buyget' && (!p.buyQuantity || !p.applyToQuantity)) ctx.addIssue({ code: 'custom', path: ['buyQuantity'], message: 'Set how many to buy and how many get the discount' })
    if (p.startsAt && p.endsAt && p.endsAt <= p.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must be after start' })
  })

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  identifier: z.string().trim().toLowerCase().min(1).max(60).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(500).nullish(),
  startsAt: date,
  endsAt: date,
  budgetType: z.enum(['spend', 'usage']).nullish(),
  budgetCurrencyCode: z.string().trim().toUpperCase().length(3).nullish(),
  budgetLimit: z.number().int().min(1).nullish(),
})

export const priceListInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  type: z.enum(['sale', 'override']).default('sale'),
  status: z.enum(['draft', 'active']).default('draft'),
  startsAt: date,
  endsAt: date,
  customerGroupIds: z.array(z.string()).max(50).default([]),
})

export const priceListPricesSchema = z.object({
  prices: z.array(z.object({ variantId: z.string(), currencyCode: z.string().trim().toUpperCase().length(3), amount: z.number().int().min(0).max(1_000_000_000), regionId: z.string().nullish() })).max(1000),
  /** Replace all prices for these variants (default) or only upsert. */
  replaceVariants: z.boolean().default(true),
})

export const giftCardInputSchema = z.object({
  value: z.number().int().min(1).max(100_000_000),
  currencyCode: z.string().trim().toUpperCase().length(3),
  regionId: z.string().nullish(),
  endsAt: date,
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,40}$/).optional(),
})

export const giftCardUpdateSchema = z.object({
  isDisabled: z.boolean().optional(),
  balance: z.number().int().min(0).optional(),
  endsAt: date,
})
