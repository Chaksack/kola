import { eq } from 'drizzle-orm'
import { customerUpdateSchema } from '#shared/schemas/auth'
import { customer } from '../../../db/schema'

export default defineValidatedHandler({ body: customerUpdateSchema }, async (event, { body }) => {
  await requirePublishableKey(event)
  const actor = await requireCustomer(event)
  const [row] = await useDb()
    .update(customer)
    .set(body)
    .where(eq(customer.id, actor.id))
    .returning({ id: customer.id, email: customer.email, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone })
  await setSessionActor(event, 'customer', { id: row!.id, email: row!.email, name: fullName(row!.firstName, row!.lastName) })
  return { customer: row }
})
