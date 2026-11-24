import { and, eq, isNull } from 'drizzle-orm'
import { inviteCreateSchema } from '#shared/schemas/auth'
import { canAssignRole } from '#shared/utils/roles'
import { invite, user } from '../../../db/schema'

const INVITE_TTL_DAYS = 7

export default defineValidatedHandler({ body: inviteCreateSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  if (!canAssignRole(actor.role, body.role)) throw apiError(403, 'forbidden', `You can't invite a ${body.role}`)
  const db = useDb()
  const [existing] = await db.select({ id: user.id }).from(user).where(and(eq(user.email, body.email), isNull(user.deletedAt)))
  if (existing) throw conflict('A user with this email already exists')

  const token = randomToken('inv_', 32)
  const [row] = await db
    .insert(invite)
    .values({
      email: body.email,
      role: body.role,
      tokenHash: sha256(token),
      invitedBy: actor.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    })
    .returning({ id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt })
  const url = `${useServerConfig().storeUrl}/admin/invite?token=${encodeURIComponent(token)}`
  await audit(event, actor, 'invite.created', 'invite', row!.id, { email: body.email, role: body.role })
  await emitEvent('invite.created', { id: row!.id, email: body.email, role: body.role, url })
  // The URL is returned once so the inviter can share it directly; only its hash is stored.
  return { invite: row, url }
})
