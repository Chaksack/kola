import { deliverDue } from '../services/webhooks'

export function webhookKey(): string {
  const key = useServerConfig().webhookSigningKey
  if (!key) throw apiError(503, 'webhooks_not_configured', 'Set WEBHOOK_SIGNING_KEY (or CRON_SECRET) to send webhooks')
  return key
}

export const deliverDueWebhooks = (limit = 50) => deliverDue(useDb(), { serverKey: webhookKey(), limit })
