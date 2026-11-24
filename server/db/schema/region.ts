import { boolean, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { id, timestamps, type Metadata } from './_common'
import { currency } from './store'

export const region = pgTable('region', {
  id: id('reg'),
  name: text('name').notNull(),
  currencyCode: text('currency_code')
    .notNull()
    .references(() => currency.code),
  taxInclusive: boolean('tax_inclusive').notNull().default(false),
  automaticTaxes: boolean('automatic_taxes').notNull().default(true),
  metadata: jsonb('metadata').$type<Metadata>(),
  ...timestamps,
})

export const regionCountry = pgTable(
  'region_country',
  {
    iso2: text('iso_2').primaryKey(),
    name: text('name').notNull(),
    regionId: text('region_id').references(() => region.id, { onDelete: 'set null' }),
  },
  (t) => [index('region_country_region_idx').on(t.regionId)],
)

/** Payment provider ids: `paystack`, `stripe`, `manual`. */
export const regionPaymentProvider = pgTable(
  'region_payment_provider',
  {
    regionId: text('region_id')
      .notNull()
      .references(() => region.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.regionId, t.providerId] })],
)

/** Tax rate in basis points: 1500 = 15%. */
export const taxRate = pgTable(
  'tax_rate',
  {
    id: id('txr'),
    regionId: text('region_id')
      .notNull()
      .references(() => region.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    rateBps: integer('rate_bps').notNull(),
    isDefault: boolean('is_default').notNull().default(true),
    productTypeId: text('product_type_id'),
    ...timestamps,
  },
  (t) => [index('tax_rate_region_idx').on(t.regionId)],
)
