import { asc, eq } from 'drizzle-orm'
import { customer, customerAddress } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requirePublishableKey(event)
  const actor = await requireCustomer(event)
  const db = useDb()
  const [row] = await db
    .select({ id: customer.id, email: customer.email, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, createdAt: customer.createdAt })
    .from(customer)
    .where(eq(customer.id, actor.id))
  const addresses = await db.select().from(customerAddress).where(eq(customerAddress.customerId, actor.id)).orderBy(asc(customerAddress.createdAt))
  return { customer: { ...row, addresses: addresses.filter((a) => !a.deletedAt) } }
})
