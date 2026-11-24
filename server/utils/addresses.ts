import { and, eq, ne } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import { customerAddress } from '../db/schema'

/** Keep at most one default shipping and one default billing address per customer. */
export async function clearOtherDefaults(db: DbLike, customerId: string, keepId: string, flags: { isDefaultShipping?: boolean; isDefaultBilling?: boolean }) {
  if (flags.isDefaultShipping) {
    await db.update(customerAddress).set({ isDefaultShipping: false }).where(and(eq(customerAddress.customerId, customerId), ne(customerAddress.id, keepId)))
  }
  if (flags.isDefaultBilling) {
    await db.update(customerAddress).set({ isDefaultBilling: false }).where(and(eq(customerAddress.customerId, customerId), ne(customerAddress.id, keepId)))
  }
}
