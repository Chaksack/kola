import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { invite } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().update(invite).set({ deletedAt: new Date() }).where(eq(invite.id, params.id)).returning({ id: invite.id })
  if (!row) throw notFound('Invite')
  await audit(event, actor, 'invite.revoked', 'invite', params.id)
  return { id: params.id, deleted: true }
})
