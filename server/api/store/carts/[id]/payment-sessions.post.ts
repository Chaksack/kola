import { z } from 'zod'
import { idParamSchema } from '#shared/schemas/common'
import { createPaymentSession } from '../../../../services/checkout'
import { PaymentProviderError } from '../../../../providers/payment/types'

export default defineValidatedHandler({ params: idParamSchema, body: z.object({ providerId: z.string().min(1).max(40) }) }, async (event, { params, body }) => {
  await storeCart(event, params.id)
  await rateLimit(event, 'payment-session', 30, 600)
  try {
    return { session: await createPaymentSession(useCheckoutDeps(), params.id, body.providerId) }
  } catch (err) {
    if (err instanceof PaymentProviderError) throw apiError(502, 'payment_provider_error', `${err.provider}: ${err.message}`)
    throw err
  }
})
