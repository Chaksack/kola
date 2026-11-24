import { configValue } from '#shared/utils/config'

/** Typed server config with unexpanded "{{VAR}}" placeholders normalized to ''. */
export function useServerConfig() {
  const c = useRuntimeConfig()
  return {
    databaseUrl: configValue(c.databaseUrl),
    blobReadWriteToken: configValue(c.blobReadWriteToken),
    paystackSecretKey: configValue(c.paystackSecretKey),
    stripeSecretKey: configValue(c.stripeSecretKey),
    stripeWebhookSecret: configValue(c.stripeWebhookSecret),
    resendApiKey: configValue(c.resendApiKey),
    cronSecret: configValue(c.cronSecret),
    emailFrom: c.emailFrom,
    allowDataUrlUploads: Boolean(c.allowDataUrlUploads),
    storeUrl: configValue(c.public.storeUrl) || 'http://localhost:3000',
    publishableKey: configValue(c.public.publishableKey),
  }
}
