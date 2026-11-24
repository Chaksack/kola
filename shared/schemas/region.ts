import { z } from 'zod'
import { isCountryCode } from '../utils/countries'

const country = z.string().trim().toLowerCase().length(2).refine(isCountryCode, 'Unknown country code')
const providerId = z.enum(['paystack', 'paystack-momo', 'stripe', 'manual'])

export const taxRateInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(50),
  /** Basis points: 1500 = 15% */
  rateBps: z.number().int().min(0).max(10_000),
  isDefault: z.boolean().default(true),
  productTypeId: z.string().nullish(),
})

export const regionInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  currencyCode: z.string().trim().toUpperCase().length(3),
  taxInclusive: z.boolean().default(false),
  automaticTaxes: z.boolean().default(true),
  countries: z.array(country).max(250).default([]),
  paymentProviders: z.array(providerId).max(10).default([]),
  /** Optional default rate created with the region. */
  defaultTaxRate: taxRateInputSchema.omit({ isDefault: true, productTypeId: true }).optional(),
})

export const salesChannelInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  isDisabled: z.boolean().default(false),
})

export const storeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultCurrencyCode: z.string().trim().toUpperCase().length(3),
  defaultRegionId: z.string().nullish(),
  defaultLocationId: z.string().nullish(),
  defaultSalesChannelId: z.string().nullish(),
  currencies: z.array(z.string().trim().toUpperCase().length(3)).min(1).max(50),
})
