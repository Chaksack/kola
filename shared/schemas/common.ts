import { z } from 'zod'

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.string().max(64).optional(),
  q: z.string().trim().max(200).optional(),
})
export type ListQuery = z.infer<typeof listQuerySchema>

export const idParamSchema = z.object({ id: z.string().min(1).max(64) })

export const emailSchema = z.string().trim().toLowerCase().email().max(254)
export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(200)

export const addressSchema = z.object({
  firstName: z.string().trim().max(100).nullish(),
  lastName: z.string().trim().max(100).nullish(),
  company: z.string().trim().max(200).nullish(),
  address1: z.string().trim().max(200).nullish(),
  address2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(100).nullish(),
  province: z.string().trim().max(100).nullish(),
  postalCode: z.string().trim().max(20).nullish(),
  countryCode: z.string().trim().toLowerCase().length(2).nullish(),
  phone: z.string().trim().max(32).nullish(),
})
export type AddressInput = z.infer<typeof addressSchema>

export interface ListResponse<T> {
  data: T[]
  count: number
  limit: number
  offset: number
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}
