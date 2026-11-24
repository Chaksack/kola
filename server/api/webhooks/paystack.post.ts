import { handlePaymentWebhook } from '../../services/payment-webhooks'

/** Signature-verified, idempotent paystack webhook. Always answers 200 once verified so the provider stops retrying. */
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  let provider
  try {
    provider = usePaymentProvider('paystack')
  } catch {
    setResponseStatus(event, 503)
    return { code: 'provider_not_configured', message: 'paystack is not configured' }
  }
  const headers = Object.fromEntries(Object.entries(getRequestHeaders(event)).map(([k, v]) => [k.toLowerCase(), v]))
  const evt = await provider.parseWebhook?.(raw, headers)
  if (!evt) {
    setResponseStatus(event, 400)
    return { code: 'invalid_signature', message: 'Webhook signature verification failed' }
  }
  const result = await handlePaymentWebhook(useCheckoutDeps(), 'paystack', evt)
  return { received: true, ...result }
})
