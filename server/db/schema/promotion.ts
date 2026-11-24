import { boolean, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps, ts } from './_common'

export const campaign = pgTable('campaign', {
  id: id('camp'),
  name: text('name').notNull(),
  identifier: text('identifier').notNull().unique(),
  description: text('description'),
  startsAt: ts('starts_at'),
  endsAt: ts('ends_at'),
  budgetType: text('budget_type', { enum: ['spend', 'usage'] }),
  budgetCurrencyCode: text('budget_currency_code'),
  budgetLimit: integer('budget_limit'),
  budgetUsed: integer('budget_used').notNull().default(0),
  ...timestamps,
})

export const promotion = pgTable(
  'promotion',
  {
    id: id('promo'),
    code: text('code').notNull().unique(),
    type: text('type', { enum: ['standard', 'buyget'] }).notNull().default('standard'),
    isAutomatic: boolean('is_automatic').notNull().default(false),
    status: text('status', { enum: ['draft', 'active', 'inactive'] }).notNull().default('draft'),
    campaignId: text('campaign_id').references(() => campaign.id, { onDelete: 'set null' }),
    /** percentage: value is basis points (1000 = 10%). fixed: value is minor units in currencyCode. */
    applicationType: text('application_type', { enum: ['percentage', 'fixed'] }).notNull(),
    value: integer('value').notNull(),
    currencyCode: text('currency_code'),
    targetType: text('target_type', { enum: ['items', 'shipping', 'order'] }).notNull().default('order'),
    allocation: text('allocation', { enum: ['each', 'across'] }).notNull().default('across'),
    maxQuantity: integer('max_quantity'),
    /** buyget: buy `buyQuantity` of the buy rules, get `applyToQuantity` of targets at value. */
    buyQuantity: integer('buy_quantity'),
    applyToQuantity: integer('apply_to_quantity'),
    stackable: boolean('stackable').notNull().default(false),
    usageLimit: integer('usage_limit'),
    usageCount: integer('usage_count').notNull().default(0),
    startsAt: ts('starts_at'),
    endsAt: ts('ends_at'),
    ...timestamps,
  },
  (t) => [index('promotion_status_idx').on(t.status)],
)

export const PROMOTION_RULE_ATTRIBUTES = [
  'product',
  'collection',
  'category',
  'product_type',
  'customer_group',
  'region',
  'currency',
  'min_subtotal',
] as const

export const promotionRule = pgTable(
  'promotion_rule',
  {
    id: id('prorul'),
    promotionId: text('promotion_id')
      .notNull()
      .references(() => promotion.id, { onDelete: 'cascade' }),
    /** condition = cart must satisfy; target = which items it applies to; buy = buyget qualifiers */
    ruleType: text('rule_type', { enum: ['condition', 'target', 'buy'] }).notNull().default('condition'),
    attribute: text('attribute', { enum: PROMOTION_RULE_ATTRIBUTES }).notNull(),
    operator: text('operator', { enum: ['in', 'eq', 'gte', 'lte'] }).notNull().default('in'),
    values: jsonb('values').$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index('promotion_rule_promotion_idx').on(t.promotionId)],
)
