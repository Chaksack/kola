import { z } from 'zod'
import { addressSchema } from './common'

export const locationInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: addressSchema.nullish(),
})

export const inventoryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(200).optional(),
  locationId: z.string().optional(),
  status: z.enum(['low_stock', 'out_of_stock', 'in_stock']).optional(),
})

export const levelUpdateSchema = z
  .object({
    locationId: z.string().min(1),
    stocked: z.number().int().min(0).max(10_000_000).optional(),
    adjustment: z.number().int().min(-10_000_000).max(10_000_000).optional(),
    incoming: z.number().int().min(0).max(10_000_000).optional(),
  })
  .refine((v) => v.stocked === undefined || v.adjustment === undefined, { message: 'Send stocked or adjustment, not both' })

export const inventoryItemUpdateSchema = z.object({
  lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
  levels: z.array(levelUpdateSchema).max(50).optional(),
})

export const shippingProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['default', 'gift_card', 'custom']).default('custom'),
})

export const serviceZoneInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  countries: z.array(z.string().trim().toLowerCase().length(2)).min(1).max(250),
})

export const shippingRuleSchema = z.object({
  attribute: z.enum(['subtotal', 'is_return', 'enabled_in_store']),
  operator: z.enum(['gte', 'lte', 'eq']),
  value: z.union([z.number(), z.string(), z.boolean()]),
})

export const shippingOptionInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  serviceZoneId: z.string().min(1),
  shippingProfileId: z.string().min(1),
  priceType: z.enum(['flat', 'calculated']).default('flat'),
  description: z.string().trim().max(300).nullish(),
  isReturn: z.boolean().default(false),
  adminOnly: z.boolean().default(false),
  rules: z.array(shippingRuleSchema).max(10).default([]),
  prices: z
    .array(z.object({ currencyCode: z.string().trim().toUpperCase().length(3), regionId: z.string().nullish(), amount: z.number().int().min(0).max(100_000_000) }))
    .max(50)
    .default([]),
})
