import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { customer } from '../../../db/schema'

/** Soft-delete and anonymise the login so the email can register again. Orders keep their snapshot. */
export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb()
    .update(customer)
    .set({ deletedAt: new Date(), hasAccount: false, passwordHash: null })
    .where(and(eq(customer.id, params.id), isNull(customer.deletedAt)))
    .returning({ id: customer.id })
  if (!row) throw notFound('Customer')
  await audit(event, actor, 'customer.deleted', 'customer', params.id)
  return { id: params.id, deleted: true }
})
