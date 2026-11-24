import { eq } from 'drizzle-orm'
import { profileUpdateSchema } from '#shared/schemas/auth'
import { user } from '../../../db/schema'

export default defineValidatedHandler({ body: profileUpdateSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  if (actor.type !== 'user') throw apiError(403, 'forbidden', 'API keys have no profile')
  const db = useDb()
  const patch: Partial<typeof user.$inferInsert> = { firstName: body.firstName, lastName: body.lastName }
  if (body.newPassword) {
    await rateLimit(event, 'password-change', 5, 900, actor.id)
    const [row] = await db.select({ passwordHash: user.passwordHash }).from(user).where(eq(user.id, actor.id))
    if (!row || !(await verifyPassword(row.passwordHash, body.currentPassword ?? ''))) {
      throw apiError(400, 'invalid_password', 'Current password is incorrect', [{ path: 'currentPassword', message: 'Current password is incorrect' }])
    }
    patch.passwordHash = await hashPassword(body.newPassword)
  }
  const [row] = await db
    .update(user)
    .set(patch)
    .where(eq(user.id, actor.id))
    .returning({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role })
  const admin = { id: row!.id, email: row!.email, name: fullName(row!.firstName, row!.lastName), role: row!.role }
  await setSessionActor(event, 'admin', admin)
  if (body.newPassword) await audit(event, actor, 'user.password_changed', 'user', actor.id)
  return { user: admin }
})
