import { and, eq, isNull } from 'drizzle-orm'
import { loginSchema } from '#shared/schemas/auth'
import { user } from '../../../db/schema'

export default defineValidatedHandler({ body: loginSchema }, async (event, { body }) => {
  await rateLimit(event, 'admin-login', 10, 300)
  await rateLimit(event, 'admin-login-email', 10, 900, body.email)
  const db = useDb()
  const [row] = await db.select().from(user).where(and(eq(user.email, body.email), isNull(user.deletedAt)))
  const ok = await verifyPasswordConstantTime(row?.passwordHash, body.password)
  if (!row || !ok) throw apiError(401, 'invalid_credentials', 'Email or password is incorrect')

  await db.update(user).set({ lastLoginAt: new Date() }).where(eq(user.id, row.id))
  const admin = { id: row.id, email: row.email, name: fullName(row.firstName, row.lastName), role: row.role }
  await setSessionActor(event, 'admin', admin)
  await audit(event, { type: 'user', ...admin }, 'auth.login', 'user', row.id)
  return { user: admin }
})
