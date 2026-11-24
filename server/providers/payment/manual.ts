import type { PaymentProvider } from './types'

/**
 * Cash on delivery / bank transfer. Nothing is charged online: the order is placed with payment
 * "awaiting" and an admin captures it when the money arrives.
 */
export function manualProvider(): PaymentProvider {
  return {
    id: 'manual',
    async initiate() {
      return { status: 'pending', data: {} }
    },
    async authorize() {
      return { status: 'authorized', data: { method: 'cash_on_delivery' } }
    },
    async capture(data) {
      return { status: 'captured', data }
    },
    async refund() {
      return { reference: null }
    },
    async cancel() {},
  }
}
