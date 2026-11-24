import { consoleProvider, resendProvider, type EmailMessage, type NotificationProvider } from '../providers/notification'
import { notification } from '../db/schema'

export function useNotificationProvider(): NotificationProvider {
  const cfg = useServerConfig()
  return cfg.resendApiKey ? resendProvider(cfg.resendApiKey, cfg.emailFrom) : consoleProvider()
}

/** Send and log. Failures are recorded, never thrown: an email must not break checkout. */
export async function sendEmail(template: string, msg: EmailMessage, resourceId: string | null) {
  const provider = useNotificationProvider()
  try {
    await provider.send(msg)
    await useDb().insert(notification).values({ to: msg.to, template, providerId: provider.id, status: 'sent', resourceId })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'send failed'
    console.error(`[email] ${template} to ${msg.to} failed: ${error}`)
    await useDb().insert(notification).values({ to: msg.to, template, providerId: provider.id, status: 'failed', resourceId, error })
  }
}
