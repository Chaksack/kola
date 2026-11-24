import { text, timestamp } from 'drizzle-orm/pg-core'
import { newId } from '../../../shared/utils/id'

export const id = (prefix: string) =>
  text('id')
    .primaryKey()
    .$defaultFn(() => newId(prefix))

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
}

export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export interface AddressSnapshot {
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
}

export type Metadata = Record<string, unknown>
