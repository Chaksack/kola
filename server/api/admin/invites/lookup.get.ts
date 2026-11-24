import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { invite } from '../../../db/schema'

export default defineValidatedHandler({ query: z.object({ token: z.string().min(20).max(200) }) }, async (event, { query }) => {
  await rateLimit(event, 'invite-lookup', 30, 300)
  const [row] = await useDb()
    .select({ email: invite.email, role: invite.role })
    .from(invite)
    .where(and(eq(invite.tokenHash, sha256(query.token)), isNull(invite.acceptedAt), isNull(invite.deletedAt), gt(invite.expiresAt, new Date())))
  if (!row) throw apiError(404, 'invite_invalid', 'This invite is invalid or has expired')
  return { invite: row }
})
