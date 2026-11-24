import { createHmac, timingSafeEqual } from 'node:crypto'
import { PaymentProviderError, type PaymentProvider, type ProviderResult } from './types'

const API = 'https://api.paystack.co'

interface PaystackResponse<T> {
  status: boolean
  message: string
  data: T
}

/**
 * Paystack (GHS cards and mobile money). Paystack charges immediately, so a successful verification
 * means the payment is captured. `channels` limits the popup, e.g. ['mobile_money'].
 */
export function paystackProvider(secretKey: string, opts: { id?: string; channels?: string[]; fetch?: typeof fetch } = {}): PaymentProvider {
  const id = opts.id ?? 'paystack'
  const doFetch = opts.fetch ?? fetch

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await doFetch(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    })
    const body = (await res.json().catch(() => ({}))) as PaystackResponse<T>
    if (!res.ok || !body.status) throw new PaymentProviderError(id, body.message || `Paystack request failed (${res.status})`)
    return body.data
  }

  async function verify(reference: string): Promise<ProviderResult> {
    const tx = await call<{ status: string; reference: string; amount: number; id: number; channel: string }>(`/transaction/verify/${encodeURIComponent(reference)}`)
    const status = tx.status === 'success' ? 'captured' : tx.status === 'failed' || tx.status === 'abandoned' ? 'error' : 'requires_action'
    return { status, reference: tx.reference, data: { reference: tx.reference, transactionId: tx.id, channel: tx.channel, amount: tx.amount } }
  }

  return {
    id,
    async initiate(input) {
      const data = await call<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email: input.email,
          amount: input.amount,
          currency: input.currencyCode,
          reference: input.reference,
          channels: opts.channels,
          metadata: input.metadata,
        }),
      })
      return { status: 'pending', reference: data.reference, data: { accessCode: data.access_code, reference: data.reference, authorizationUrl: data.authorization_url } }
    },
    async authorize(data) {
      return verify(String(data.reference))
    },
    async capture(data) {
      // Already captured at charge time.
      return { status: 'captured', data }
    },
    async refund(data, amount) {
      const r = await call<{ id: number }>('/refund', { method: 'POST', body: JSON.stringify({ transaction: data.reference, amount }) })
      return { reference: String(r.id) }
    },
    async cancel() {
      // Unpaid Paystack transactions simply expire.
    },
    async parseWebhook(rawBody, headers) {
      const signature = headers['x-paystack-signature'] ?? ''
      const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex')
      if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
      const event = JSON.parse(rawBody) as { event: string; data: { id: number; reference: string; amount: number; transaction?: { reference: string } } }
      const ref = event.data.reference ?? event.data.transaction?.reference
      const type = event.event === 'charge.success' ? 'payment.captured' : event.event === 'charge.failed' ? 'payment.failed' : event.event === 'refund.processed' ? 'payment.refunded' : 'ignored'
      return { id: `${event.event}:${event.data.id}`, type, sessionId: ref, providerReference: ref, amount: event.data.amount }
    },
  }
}
