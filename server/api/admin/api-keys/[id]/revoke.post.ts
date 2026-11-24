import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { apiKey } from '../../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb()
    .update(apiKey)
    .set({ revokedAt: new Date(), revokedBy: actor.id })
    .where(and(eq(apiKey.id, params.id), isNull(apiKey.revokedAt), isNull(apiKey.deletedAt)))
    .returning({ id: apiKey.id, revokedAt: apiKey.revokedAt })
  if (!row) throw notFound('Active API key')
  await audit(event, actor, 'api_key.revoked', 'api_key', params.id)
  return { apiKey: row }
})
