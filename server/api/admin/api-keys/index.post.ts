import { apiKeyCreateSchema } from '#shared/schemas/auth'
import { apiKey, apiKeySalesChannel } from '../../../db/schema'

export default defineValidatedHandler({ body: apiKeyCreateSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  // Only people can mint secret keys, so a leaked key can't create more keys.
  if (body.type === 'secret' && actor.type !== 'user') throw apiError(403, 'forbidden', 'Secret keys can only be created by a signed-in user')
  const token = randomToken(body.type === 'secret' ? 'sk_' : 'pk_', 32)
  const created = await useTx(async (tx) => {
    const [row] = await tx
      .insert(apiKey)
      .values({
        title: body.title,
        type: body.type,
        token: body.type === 'secret' ? sha256(token) : token,
        redacted: redact(token),
        createdBy: actor.id,
      })
      .returning({ id: apiKey.id, title: apiKey.title, type: apiKey.type, redacted: apiKey.redacted, createdAt: apiKey.createdAt })
    if (body.type === 'publishable' && body.salesChannelIds?.length) {
      await tx.insert(apiKeySalesChannel).values(body.salesChannelIds.map((salesChannelId) => ({ apiKeyId: row!.id, salesChannelId })))
    }
    return row!
  })
  await audit(event, actor, 'api_key.created', 'api_key', created.id, { type: body.type, title: body.title })
  // The full secret is returned exactly once.
  return { apiKey: created, token }
})
