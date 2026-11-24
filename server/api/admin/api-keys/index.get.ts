import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { apiKey, apiKeySalesChannel, salesChannel } from '../../../db/schema'

export default defineValidatedHandler({ query: z.object({ type: z.enum(['publishable', 'secret']) }) }, async (event, { query }) => {
  // Members can see that keys exist (read-only); creating and revoking needs admin.
  await requireAdmin(event)
  const db = useDb()
  const keys = await db
    .select({ id: apiKey.id, title: apiKey.title, type: apiKey.type, token: apiKey.token, redacted: apiKey.redacted, lastUsedAt: apiKey.lastUsedAt, revokedAt: apiKey.revokedAt, createdAt: apiKey.createdAt })
    .from(apiKey)
    .where(and(eq(apiKey.type, query.type), isNull(apiKey.deletedAt)))
    .orderBy(desc(apiKey.createdAt))
  const links = keys.length
    ? await db
        .select({ apiKeyId: apiKeySalesChannel.apiKeyId, id: salesChannel.id, name: salesChannel.name })
        .from(apiKeySalesChannel)
        .innerJoin(salesChannel, eq(salesChannel.id, apiKeySalesChannel.salesChannelId))
        .where(inArray(apiKeySalesChannel.apiKeyId, keys.map((k) => k.id)))
    : []
  return {
    data: keys.map((k) => ({
      ...k,
      // Publishable tokens are public by design; secret tokens are only ever stored hashed.
      token: k.type === 'publishable' ? k.token : undefined,
      salesChannels: links.filter((l) => l.apiKeyId === k.id).map(({ id, name }) => ({ id, name })),
    })),
  }
})
