import { manualProvider } from '../providers/payment/manual'
import { paystackProvider } from '../providers/payment/paystack'
import { stripeProvider } from '../providers/payment/stripe'
import type { PaymentProvider } from '../providers/payment/types'

/** Resolve a provider by id from server config. Throws when it isn't configured. */
export function usePaymentProvider(id: string): PaymentProvider {
  const cfg = useServerConfig()
  switch (id) {
    case 'manual':
      return manualProvider()
    case 'paystack':
    case 'paystack-momo':
      if (!cfg.paystackSecretKey) break
      return paystackProvider(cfg.paystackSecretKey, { id, channels: id === 'paystack-momo' ? ['mobile_money'] : ['card', 'bank', 'mobile_money'] })
    case 'stripe':
      if (!cfg.stripeSecretKey) break
      return stripeProvider(cfg.stripeSecretKey, cfg.stripeWebhookSecret || undefined)
  }
  throw apiError(400, 'payment_provider_unavailable', `Payment provider "${id}" is not available`)
}
