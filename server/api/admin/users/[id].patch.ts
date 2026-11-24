import { and, count, eq, isNull } from 'drizzle-orm'
import { userUpdateSchema } from '#shared/schemas/auth'
import { idParamSchema } from '#shared/schemas/common'
import { canAssignRole } from '#shared/utils/roles'
import { user } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: userUpdateSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const db = useDb()
  const [target] = await db.select().from(user).where(and(eq(user.id, params.id), isNull(user.deletedAt)))
  if (!target) throw notFound('User')
  if (!canAssignRole(actor.role, target.role)) throw apiError(403, 'forbidden', `You can't modify a ${target.role}`)
  if (body.role && body.role !== target.role) {
    if (!canAssignRole(actor.role, body.role)) throw apiError(403, 'forbidden', `You can't assign the ${body.role} role`)
    if (target.role === 'owner') {
      const [owners] = await db.select({ value: count() }).from(user).where(and(eq(user.role, 'owner'), isNull(user.deletedAt)))
      if ((owners?.value ?? 0) <= 1) throw conflict('The store needs at least one owner')
    }
  }
  const [row] = await db
    .update(user)
    .set({ role: body.role, firstName: body.firstName, lastName: body.lastName })
    .where(eq(user.id, params.id))
    .returning({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role })
  await audit(event, actor, 'user.updated', 'user', params.id, { role: body.role })
  return { user: row }
})
