import { and, eq, isNull, isNotNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { apiKey } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  // Keys must be revoked before they can be deleted, so deletion is never the first line of defence.
  const [row] = await useDb()
    .update(apiKey)
    .set({ deletedAt: new Date() })
    .where(and(eq(apiKey.id, params.id), isNotNull(apiKey.revokedAt), isNull(apiKey.deletedAt)))
    .returning({ id: apiKey.id })
  if (!row) throw conflict('Revoke the key before deleting it')
  await audit(event, actor, 'api_key.deleted', 'api_key', params.id)
  return { id: params.id, deleted: true }
})
