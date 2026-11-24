import { z } from 'zod'

const minor = z.number().int().min(1).max(1_000_000_000)
const qty = z.number().int().min(0).max(10_000)

export const adminOrderListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  tab: z.enum(['all', 'unfulfilled', 'unpaid', 'returns']).default('all'),
  q: z.string().trim().max(200).optional(),
  salesChannelId: z.string().optional(),
  regionId: z.string().optional(),
  paymentStatus: z.string().max(40).optional(),
  fulfillmentStatus: z.string().max(40).optional(),
  order: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).default('newest'),
})

export const noteSchema = z.object({ message: z.string().trim().min(1).max(2000) })
export const captureSchema = z.object({ amount: minor.optional() })
export const refundSchema = z.object({ amount: minor, reason: z.string().trim().max(100).optional(), note: z.string().trim().max(1000).optional() })
export const recordPaymentSchema = z.object({ amount: minor, note: z.string().trim().max(500).optional() })
export const fulfillmentCreateSchema = z.object({
  locationId: z.string().min(1),
  items: z.array(z.object({ itemId: z.string(), quantity: qty })).min(1).max(200),
})
export const shipSchema = z.object({
  tracking: z.array(z.object({ number: z.string().trim().min(1).max(100), carrier: z.string().trim().max(100).nullish(), url: z.string().trim().url().max(500).nullish().or(z.literal('')) })).max(10).default([]),
})
export const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() })
export const returnCreateSchema = z.object({
  items: z.array(z.object({ itemId: z.string(), quantity: qty, reasonId: z.string().nullish(), note: z.string().max(500).nullish() })).min(1).max(200),
  locationId: z.string().nullish(),
  note: z.string().trim().max(1000).nullish(),
})
export const returnReceiveSchema = z.object({
  locationId: z.string().min(1),
  refund: z.boolean().default(true),
  refundAmount: z.number().int().min(0).optional(),
  items: z.array(z.object({ returnItemId: z.string(), quantity: qty })).optional(),
})
export const exchangeCreateSchema = z.object({
  returnItems: z.array(z.object({ itemId: z.string(), quantity: qty, reasonId: z.string().nullish() })).min(1).max(100),
  newItems: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1).max(1000) })).min(1).max(100),
  locationId: z.string().nullish(),
  note: z.string().trim().max(1000).nullish(),
})
export const editSchema = z.object({
  actions: z
    .array(
      z.discriminatedUnion('action', [
        z.object({ action: z.literal('item_update'), itemId: z.string(), quantity: qty }),
        z.object({ action: z.literal('item_add'), variantId: z.string(), quantity: z.number().int().min(1).max(1000) }),
        z.object({ action: z.literal('item_remove'), itemId: z.string() }),
      ]),
    )
    .min(1)
    .max(100),
  note: z.string().trim().max(1000).optional(),
})
