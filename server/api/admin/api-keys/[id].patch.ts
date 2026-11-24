import { and, eq, isNull } from 'drizzle-orm'
import { apiKeyUpdateSchema } from '#shared/schemas/auth'
import { idParamSchema } from '#shared/schemas/common'
import { apiKey, apiKeySalesChannel } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: apiKeyUpdateSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const updated = await useTx(async (tx) => {
    const [row] = await tx
      .update(apiKey)
      .set({ title: body.title })
      .where(and(eq(apiKey.id, params.id), isNull(apiKey.deletedAt)))
      .returning({ id: apiKey.id, type: apiKey.type, title: apiKey.title })
    if (!row) throw notFound('API key')
    if (body.salesChannelIds) {
      if (row.type !== 'publishable') throw badRequest('Only publishable keys have sales channels')
      await tx.delete(apiKeySalesChannel).where(eq(apiKeySalesChannel.apiKeyId, row.id))
      if (body.salesChannelIds.length) {
        await tx.insert(apiKeySalesChannel).values(body.salesChannelIds.map((salesChannelId) => ({ apiKeyId: row.id, salesChannelId })))
      }
    }
    return row
  })
  await audit(event, actor, 'api_key.updated', 'api_key', params.id)
  return { apiKey: updated }
})
