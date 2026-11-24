import { and, eq, isNull, ne } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { customerInputSchema } from '#shared/schemas/marketing'
import { customer, customerGroupMember } from '../../../db/schema'
import { getCustomerDetail } from '../../../services/customer-admin'

export default defineValidatedHandler({ params: idParamSchema, body: customerInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  await useTx(async (tx) => {
    const [clash] = await tx.select({ id: customer.id }).from(customer).where(and(eq(customer.email, body.email), eq(customer.hasAccount, true), ne(customer.id, params.id), isNull(customer.deletedAt)))
    if (clash) throw conflict('Another account uses this email')
    const [row] = await tx.update(customer).set({ email: body.email, firstName: body.firstName ?? null, lastName: body.lastName ?? null, phone: body.phone ?? null }).where(and(eq(customer.id, params.id), isNull(customer.deletedAt))).returning({ id: customer.id })
    if (!row) throw notFound('Customer')
    await tx.delete(customerGroupMember).where(eq(customerGroupMember.customerId, params.id))
    if (body.groupIds.length) await tx.insert(customerGroupMember).values([...new Set(body.groupIds)].map((groupId) => ({ customerId: params.id, groupId })))
  })
  await audit(event, actor, 'customer.updated', 'customer', params.id)
  return { customer: await getCustomerDetail(useDb(), params.id) }
})
