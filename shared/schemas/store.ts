import { z } from 'zod'
import { addressSchema, emailSchema } from './common'

const csv = z
  .string()
  .max(1000)
  .transform((v) => v.split(',').map((x) => x.trim()).filter(Boolean))

export const storeProductListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
  regionId: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  collection: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  ids: csv.optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.enum(['1', 'true']).optional(),
  options: csv.optional(),
  order: z.enum(['newest', 'price_asc', 'price_desc', 'title']).default('newest'),
})

export const regionQuerySchema = z.object({ regionId: z.string().optional() })

export const cartCreateSchema = z.object({
  regionId: z.string().optional(),
  email: emailSchema.optional(),
})

export const cartUpdateSchema = z.object({
  regionId: z.string().optional(),
  email: emailSchema.nullish(),
  shippingAddress: addressSchema.nullish(),
  billingAddress: addressSchema.nullish(),
})

export const lineItemCreateSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(999).default(1),
})

export const lineItemUpdateSchema = z.object({ quantity: z.number().int().min(0).max(999) })

export const promoCodeSchema = z.object({ code: z.string().trim().min(1).max(64) })
