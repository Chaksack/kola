import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { canAssignRole } from '#shared/utils/roles'
import { user } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  if (actor.id === params.id) throw conflict("You can't remove yourself")
  const db = useDb()
  const [target] = await db.select({ role: user.role }).from(user).where(and(eq(user.id, params.id), isNull(user.deletedAt)))
  if (!target) throw notFound('User')
  if (!canAssignRole(actor.role, target.role)) throw apiError(403, 'forbidden', `You can't remove a ${target.role}`)
  // Free the email for a future invite while keeping the row for audit history.
  await db.update(user).set({ deletedAt: new Date(), email: `deleted+${params.id}@kola.invalid` }).where(eq(user.id, params.id))
  await audit(event, actor, 'user.deleted', 'user', params.id)
  return { id: params.id, deleted: true }
})
