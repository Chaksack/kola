import { idParamSchema } from '#shared/schemas/common'
import { completeCart, PaymentRequiredError } from '../../../../services/checkout'
import { getStoreOrder } from '../../../../services/order'
import { PaymentProviderError } from '../../../../providers/payment/types'

/**
 * Complete checkout. Send an Idempotency-Key header so a retried request (flaky network, double
 * click) can never create two orders. The cart itself is also idempotent: one order per cart.
 */
export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await storeCart(event, params.id)
  await rateLimit(event, 'checkout-complete', 20, 600)
  return withIdempotency(event, 'cart.complete', params.id, async () => {
    try {
      const { orderId } = await completeCart(useCheckoutDeps(), params.id)
      return { type: 'order' as const, order: await getStoreOrder(useDb(), orderId) }
    } catch (err) {
      if (err instanceof PaymentRequiredError) throw apiError(402, 'payment_required', 'Payment has not been completed', { status: err.status, session: err.session })
      if (err instanceof PaymentProviderError) throw apiError(502, 'payment_provider_error', `${err.provider}: ${err.message}`)
      throw err
    }
  })
})
