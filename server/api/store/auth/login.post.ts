import { and, eq, isNull } from 'drizzle-orm'
import { loginSchema } from '#shared/schemas/auth'
import { customer } from '../../../db/schema'

export default defineValidatedHandler({ body: loginSchema }, async (event, { body }) => {
  await requirePublishableKey(event)
  await rateLimit(event, 'customer-login', 10, 300)
  await rateLimit(event, 'customer-login-email', 10, 900, body.email)
  const [row] = await useDb()
    .select()
    .from(customer)
    .where(and(eq(customer.email, body.email), eq(customer.hasAccount, true), isNull(customer.deletedAt)))
  const ok = await verifyPasswordConstantTime(row?.passwordHash, body.password)
  if (!row || !ok) throw apiError(401, 'invalid_credentials', 'Email or password is incorrect')
  const session = { id: row.id, email: row.email, name: fullName(row.firstName, row.lastName) }
  await setSessionActor(event, 'customer', session)
  return { customer: session }
})
