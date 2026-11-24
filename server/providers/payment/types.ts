export type PaymentSessionStatus = 'pending' | 'requires_action' | 'authorized' | 'captured' | 'error' | 'canceled'

export interface InitiateInput {
  amount: number
  currencyCode: string
  email: string
  /** Our reference (payment session id). Providers echo it back in webhooks. */
  reference: string
  metadata: Record<string, string>
}

export interface ProviderResult {
  status: PaymentSessionStatus
  /** Provider references the client or later calls need. Never card data. */
  data: Record<string, unknown>
  reference?: string
}

export interface WebhookEvent {
  id: string
  type: 'payment.authorized' | 'payment.captured' | 'payment.failed' | 'payment.refunded' | 'ignored'
  /** Our payment session id, if the provider echoes it. */
  sessionId?: string
  providerReference?: string
  amount?: number
}

export interface PaymentProvider {
  id: string
  initiate(input: InitiateInput): Promise<ProviderResult>
  /** Check with the provider whether the customer completed payment. */
  authorize(data: Record<string, unknown>): Promise<ProviderResult>
  capture(data: Record<string, unknown>, amount: number): Promise<ProviderResult>
  refund(data: Record<string, unknown>, amount: number): Promise<{ reference: string | null }>
  cancel(data: Record<string, unknown>): Promise<void>
  /** Verify the signature and translate the payload. Returns null when the signature is invalid. */
  parseWebhook?(rawBody: string, headers: Record<string, string | undefined>): Promise<WebhookEvent | null>
}

export class PaymentProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
  ) {
    super(message)
  }
}
