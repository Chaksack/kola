/** Payment provider ids stored on regions and payment sessions. */
export const PAYMENT_PROVIDERS = {
  paystack: { id: 'paystack', label: 'Paystack', currencies: ['GHS', 'NGN', 'USD'] },
  'paystack-momo': { id: 'paystack-momo', label: 'Mobile money', currencies: ['GHS'] },
  stripe: { id: 'stripe', label: 'Stripe', currencies: ['EUR', 'GBP', 'USD'] },
  manual: { id: 'manual', label: 'Cash on delivery', currencies: [] as string[] },
} as const

export type PaymentProviderId = keyof typeof PAYMENT_PROVIDERS

export function providerLabel(id: string): string {
  return (PAYMENT_PROVIDERS as Record<string, { label: string }>)[id]?.label ?? id
}
