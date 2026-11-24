import { and, eq, isNull } from 'drizzle-orm'
import { customerRegisterSchema } from '#shared/schemas/auth'
import { customer } from '../../../db/schema'

export default defineValidatedHandler({ body: customerRegisterSchema }, async (event, { body }) => {
  await requirePublishableKey(event)
  await rateLimit(event, 'customer-register', 10, 600)
  const db = useDb()
  const [taken] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(and(eq(customer.email, body.email), eq(customer.hasAccount, true), isNull(customer.deletedAt)))
  if (taken) throw conflict('An account with this email already exists')

  const passwordHash = await hashPassword(body.password)
  // Upgrade an earlier guest record with the same email so their order history follows them.
  const [guest] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(and(eq(customer.email, body.email), eq(customer.hasAccount, false), isNull(customer.deletedAt)))
    .limit(1)
  const values = { firstName: body.firstName, lastName: body.lastName ?? null, phone: body.phone ?? null, hasAccount: true, passwordHash }
  const [row] = guest
    ? await db.update(customer).set(values).where(eq(customer.id, guest.id)).returning()
    : await db.insert(customer).values({ email: body.email, ...values }).returning()

  const session = { id: row!.id, email: row!.email, name: fullName(row!.firstName, row!.lastName) }
  await setSessionActor(event, 'customer', session)
  await emitEvent('customer.created', { id: row!.id, email: row!.email })
  return { customer: session }
})
