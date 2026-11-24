import { and, eq, isNull } from 'drizzle-orm'
import { customerInputSchema } from '#shared/schemas/marketing'
import { customer, customerGroupMember } from '../../../db/schema'

export default defineValidatedHandler({ body: customerInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const created = await useTx(async (tx) => {
    const [exists] = await tx.select({ id: customer.id }).from(customer).where(and(eq(customer.email, body.email), isNull(customer.deletedAt)))
    if (exists) throw conflict('A customer with this email already exists')
    const [row] = await tx.insert(customer).values({ email: body.email, firstName: body.firstName ?? null, lastName: body.lastName ?? null, phone: body.phone ?? null }).returning({ id: customer.id })
    if (body.groupIds.length) await tx.insert(customerGroupMember).values(body.groupIds.map((groupId) => ({ customerId: row!.id, groupId })))
    return row!
  })
  await audit(event, actor, 'customer.created', 'customer', created.id)
  return { customer: created }
})
