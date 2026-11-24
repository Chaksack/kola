import { boolean, index, jsonb, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { id, timestamps, type Metadata } from './_common'

export const customer = pgTable(
  'customer',
  {
    id: id('cus'),
    email: text('email').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    phone: text('phone'),
    hasAccount: boolean('has_account').notNull().default(false),
    passwordHash: text('password_hash'),
    metadata: jsonb('metadata').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [
    // One registered account per email; guests may repeat.
    uniqueIndex('customer_email_account_uq').on(t.email).where(sql`${t.hasAccount} = true and ${t.deletedAt} is null`),
    index('customer_email_idx').on(t.email),
  ],
)

export const customerAddress = pgTable(
  'customer_address',
  {
    id: id('caddr'),
    customerId: text('customer_id')
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    label: text('label'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    company: text('company'),
    address1: text('address_1'),
    address2: text('address_2'),
    city: text('city'),
    province: text('province'),
    postalCode: text('postal_code'),
    countryCode: text('country_code'),
    phone: text('phone'),
    isDefaultShipping: boolean('is_default_shipping').notNull().default(false),
    isDefaultBilling: boolean('is_default_billing').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('customer_address_customer_idx').on(t.customerId)],
)

export const customerGroup = pgTable('customer_group', {
  id: id('cusgroup'),
  name: text('name').notNull().unique(),
  metadata: jsonb('metadata').$type<Metadata>(),
  ...timestamps,
})

export const customerGroupMember = pgTable(
  'customer_group_member',
  {
    customerId: text('customer_id')
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => customerGroup.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.groupId] })],
)
