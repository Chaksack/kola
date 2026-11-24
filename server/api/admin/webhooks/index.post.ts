import { z } from 'zod'
import { WEBHOOK_EVENTS } from '#shared/utils/webhook-events'
import { assertSafeWebhookUrl, createEndpoint } from '../../../services/webhooks'

const schema = z.object({
  url: z.string().trim().max(2000),
  description: z.string().trim().max(200).nullish(),
  events: z.array(z.enum(['*', ...WEBHOOK_EVENTS])).min(1).max(50),
})

export default defineValidatedHandler({ body: schema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  assertSafeWebhookUrl(body.url, useServerConfig().allowInsecureWebhooks)
  const { endpoint, secret } = await createEndpoint(useDb(), webhookKey(), body)
  await audit(event, actor, 'webhook.created', 'webhook', endpoint.id, { url: body.url, events: body.events })
  const { secretSalt: _s, secretHash: _h, ...safe } = endpoint
  // The signing secret is shown once.
  return { endpoint: safe, secret }
})
