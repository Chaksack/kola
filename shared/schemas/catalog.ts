import { z } from 'zod'

export const PRODUCT_STATUSES = ['draft', 'proposed', 'published', 'rejected'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes')

export function toHandle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

const minor = z.number().int().min(0).max(1_000_000_000)

export const priceInputSchema = z.object({
  amount: minor,
  currencyCode: z.string().trim().toUpperCase().length(3),
  regionId: z.string().nullish(),
  minQuantity: z.number().int().min(1).nullish(),
  maxQuantity: z.number().int().min(1).nullish(),
})

export const variantInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().max(200).optional(),
  sku: z.string().trim().max(100).nullish(),
  barcode: z.string().trim().max(100).nullish(),
  manageInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  weight: z.number().int().min(0).nullish(),
  /** Option title → value, e.g. { Size: 'M', Colour: 'Indigo' } */
  options: z.record(z.string(), z.string()).default({}),
  prices: z.array(priceInputSchema).max(50).default([]),
  inventory: z
    .array(z.object({ locationId: z.string(), stocked: z.number().int().min(0).max(10_000_000) }))
    .max(50)
    .optional(),
})

export const productInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    subtitle: z.string().trim().max(200).nullish(),
    handle: handleSchema.optional(),
    description: z.string().max(20_000).nullish(),
    status: z.enum(PRODUCT_STATUSES).default('draft'),
    thumbnail: z.string().max(2000).nullish(),
    isGiftcard: z.boolean().default(false),
    discountable: z.boolean().default(true),
    weight: z.number().int().min(0).nullish(),
    length: z.number().int().min(0).nullish(),
    height: z.number().int().min(0).nullish(),
    width: z.number().int().min(0).nullish(),
    material: z.string().trim().max(200).nullish(),
    originCountry: z.string().trim().toLowerCase().length(2).nullish().or(z.literal('')),
    hsCode: z.string().trim().max(50).nullish(),
    typeId: z.string().nullish(),
    collectionId: z.string().nullish(),
    categoryIds: z.array(z.string()).max(50).default([]),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
    salesChannelIds: z.array(z.string()).max(50).default([]),
    images: z.array(z.object({ url: z.string().min(1).max(2_000_000), alt: z.string().max(300).nullish() })).max(30).default([]),
    options: z
      .array(z.object({ title: z.string().trim().min(1).max(100), values: z.array(z.string().trim().min(1).max(100)).min(1).max(100) }))
      .max(5)
      .default([]),
    variants: z.array(variantInputSchema).max(500).default([]),
    seoTitle: z.string().trim().max(200).nullish(),
    seoDescription: z.string().trim().max(500).nullish(),
  })
  .superRefine((p, ctx) => {
    const titles = p.options.map((o) => o.title.toLowerCase())
    if (new Set(titles).size !== titles.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option names must be unique' })
    p.options.forEach((o, i) => {
      if (new Set(o.values.map((v) => v.toLowerCase())).size !== o.values.length) {
        ctx.addIssue({ code: 'custom', path: ['options', i, 'values'], message: 'Option values must be unique' })
      }
    })
    const skus = p.variants.map((v) => v.sku).filter(Boolean)
    if (new Set(skus).size !== skus.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'SKUs must be unique' })
    p.variants.forEach((v, i) => {
      for (const o of p.options) {
        if (!v.options[o.title] || !o.values.includes(v.options[o.title]!)) {
          ctx.addIssue({ code: 'custom', path: ['variants', i, 'options'], message: `Pick a ${o.title} value` })
        }
      }
    })
    const combos = p.variants.map((v) => p.options.map((o) => v.options[o.title]).join('\u0000'))
    if (p.options.length && new Set(combos).size !== combos.length) {
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Two variants have the same options' })
    }
  })
export type ProductInput = z.input<typeof productInputSchema>
export type ProductInputParsed = z.output<typeof productInputSchema>

export const productListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(200).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  collectionId: z.string().optional(),
  salesChannelId: z.string().optional(),
  order: z.enum(['created_at', '-created_at', 'title', '-title', 'updated_at', '-updated_at']).default('-created_at'),
})

export const collectionInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  handle: handleSchema.optional(),
  description: z.string().max(5000).nullish(),
  thumbnail: z.string().max(2000).nullish(),
})

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  handle: handleSchema.optional(),
  description: z.string().max(5000).nullish(),
  parentId: z.string().nullish(),
  rank: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isInternal: z.boolean().optional(),
})

export const valueInputSchema = z.object({ value: z.string().trim().min(1).max(100) })
