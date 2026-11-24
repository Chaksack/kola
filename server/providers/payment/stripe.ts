import Stripe from 'stripe'
import { PaymentProviderError, type PaymentProvider, type ProviderResult } from './types'

/**
 * Stripe (EUR, GBP, USD) with manual capture: checkout authorizes, an admin captures on fulfillment.
 * The client confirms the PaymentIntent with the Payment Element.
 */
export function stripeProvider(secretKey: string, webhookSecret?: string): PaymentProvider {
  const stripe = new Stripe(secretKey)
  const map = (pi: Stripe.PaymentIntent): ProviderResult => ({
    status:
      pi.status === 'requires_capture' ? 'authorized' : pi.status === 'succeeded' ? 'captured' : pi.status === 'canceled' ? 'canceled' : pi.status === 'processing' ? 'pending' : 'requires_action',
    reference: pi.id,
    data: { paymentIntentId: pi.id, clientSecret: pi.client_secret, amountCapturable: pi.amount_capturable },
  })
  const wrap = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn()
    } catch (err) {
      throw new PaymentProviderError('stripe', err instanceof Error ? err.message : 'Stripe request failed')
    }
  }

  return {
    id: 'stripe',
    async initiate(input) {
      const pi = await wrap(() =>
        stripe.paymentIntents.create(
          {
            amount: input.amount,
            currency: input.currencyCode.toLowerCase(),
            capture_method: 'manual',
            receipt_email: input.email,
            automatic_payment_methods: { enabled: true },
            metadata: { ...input.metadata, session_id: input.reference },
          },
          { idempotencyKey: `kola-${input.reference}-${input.amount}` },
        ),
      )
      return map(pi)
    },
    async authorize(data) {
      return map(await wrap(() => stripe.paymentIntents.retrieve(String(data.paymentIntentId))))
    },
    async capture(data, amount) {
      return map(await wrap(() => stripe.paymentIntents.capture(String(data.paymentIntentId), { amount_to_capture: amount })))
    },
    async refund(data, amount) {
      const r = await wrap(() => stripe.refunds.create({ payment_intent: String(data.paymentIntentId), amount }))
      return { reference: r.id }
    },
    async cancel(data) {
      await wrap(() => stripe.paymentIntents.cancel(String(data.paymentIntentId)))
    },
    async parseWebhook(rawBody, headers) {
      if (!webhookSecret) return null
      let event: Stripe.Event
      try {
        event = stripe.webhooks.constructEvent(rawBody, headers['stripe-signature'] ?? '', webhookSecret)
      } catch {
        return null
      }
      if (event.type.startsWith('payment_intent.')) {
        const pi = event.data.object as Stripe.PaymentIntent
        const type =
          event.type === 'payment_intent.amount_capturable_updated' ? 'payment.authorized' : event.type === 'payment_intent.succeeded' ? 'payment.captured' : event.type === 'payment_intent.payment_failed' ? 'payment.failed' : 'ignored'
        return { id: event.id, type, sessionId: pi.metadata?.session_id, providerReference: pi.id, amount: pi.amount }
      }
      if (event.type === 'charge.refunded') {
        const ch = event.data.object as Stripe.Charge
        return { id: event.id, type: 'payment.refunded', providerReference: typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id, amount: ch.amount_refunded }
      }
      return { id: event.id, type: 'ignored' }
    },
  }
}
