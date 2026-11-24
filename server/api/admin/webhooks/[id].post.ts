import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { idParamSchema } from '#shared/schemas/common'
import { WEBHOOK_EVENTS } from '#shared/utils/webhook-events'
import { webhookEndpoint } from '../../../db/schema'
import { assertSafeWebhookUrl } from '../../../services/webhooks'

const schema = z.object({
  url: z.string().trim().max(2000).optional(),
  description: z.string().trim().max(200).nullish(),
  events: z.array(z.enum(['*', ...WEBHOOK_EVENTS])).min(1).max(50).optional(),
  status: z.enum(['enabled', 'disabled']).optional(),
})

export default defineValidatedHandler({ params: idParamSchema, body: schema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  if (body.url) assertSafeWebhookUrl(body.url, useServerConfig().allowInsecureWebhooks)
  const [row] = await useDb().update(webhookEndpoint).set(body).where(and(eq(webhookEndpoint.id, params.id), isNull(webhookEndpoint.deletedAt))).returning()
  if (!row) throw notFound('Webhook')
  await audit(event, actor, 'webhook.updated', 'webhook', params.id, { status: body.status })
  const { secretSalt: _s, secretHash: _h, ...safe } = row
  return { endpoint: safe }
})
