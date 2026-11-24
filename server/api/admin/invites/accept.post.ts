import { and, eq, gt, isNull } from 'drizzle-orm'
import { inviteAcceptSchema } from '#shared/schemas/auth'
import { invite, user } from '../../../db/schema'

export default defineValidatedHandler({ body: inviteAcceptSchema }, async (event, { body }) => {
  await rateLimit(event, 'invite-accept', 10, 300)
  const passwordHash = await hashPassword(body.password)
  const created = await useTx(async (tx) => {
    // Claim the invite atomically so it can only be used once.
    const [inv] = await tx
      .update(invite)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invite.tokenHash, sha256(body.token)), isNull(invite.acceptedAt), isNull(invite.deletedAt), gt(invite.expiresAt, new Date())))
      .returning()
    if (!inv) throw apiError(404, 'invite_invalid', 'This invite is invalid or has expired')
    const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.email, inv.email))
    if (existing) throw conflict('A user with this email already exists')
    const [u] = await tx
      .insert(user)
      .values({ email: inv.email, firstName: body.firstName, lastName: body.lastName, role: inv.role, passwordHash, lastLoginAt: new Date() })
      .returning()
    return u!
  })
  const admin = { id: created.id, email: created.email, name: fullName(created.firstName, created.lastName), role: created.role }
  await setSessionActor(event, 'admin', admin)
  await audit(event, { type: 'user', ...admin }, 'invite.accepted', 'user', created.id)
  return { user: admin }
})
