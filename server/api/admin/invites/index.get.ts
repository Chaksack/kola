import { and, desc, isNull } from 'drizzle-orm'
import { invite } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event, 'admin')
  const rows = await useDb()
    .select({ id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt, createdAt: invite.createdAt })
    .from(invite)
    .where(and(isNull(invite.acceptedAt), isNull(invite.deletedAt)))
    .orderBy(desc(invite.createdAt))
  return { data: rows.map((r) => ({ ...r, expired: r.expiresAt < new Date() })) }
})
