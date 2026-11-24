import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { paystackProvider } from '../../server/providers/payment/paystack'

const SECRET = 'sk_test_unit'

function mockFetch(responses: Record<string, unknown>) {
  return vi.fn(async (url: string | URL | Request) => {
    const path = String(url).replace('https://api.paystack.co', '')
    const key = Object.keys(responses).find((k) => path.startsWith(k))
    return new Response(JSON.stringify(key ? responses[key] : { status: false, message: 'not found' }), { status: key ? 200 : 404 })
  }) as unknown as typeof fetch
}

describe('paystack provider', () => {
  it('initializes a transaction and returns the access code', async () => {
    const fetch = mockFetch({ '/transaction/initialize': { status: true, message: 'ok', data: { authorization_url: 'https://checkout.paystack.com/x', access_code: 'acc_1', reference: 'payses_1' } } })
    const p = paystackProvider(SECRET, { fetch })
    const r = await p.initiate({ amount: 15000, currencyCode: 'GHS', email: 'a@b.com', reference: 'payses_1', metadata: {} })
    expect(r).toMatchObject({ status: 'pending', data: { accessCode: 'acc_1', reference: 'payses_1' } })
    const body = JSON.parse(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body))
    expect(body).toMatchObject({ amount: 15000, currency: 'GHS', reference: 'payses_1' })
  })

  it('maps verification results', async () => {
    const ok = paystackProvider(SECRET, { fetch: mockFetch({ '/transaction/verify/': { status: true, message: 'ok', data: { status: 'success', reference: 'r1', amount: 15000, id: 9, channel: 'mobile_money' } } }) })
    expect((await ok.authorize({ reference: 'r1' })).status).toBe('captured')
    const failed = paystackProvider(SECRET, { fetch: mockFetch({ '/transaction/verify/': { status: true, message: 'ok', data: { status: 'failed', reference: 'r1', amount: 15000, id: 9, channel: 'card' } } }) })
    expect((await failed.authorize({ reference: 'r1' })).status).toBe('error')
  })

  it('verifies webhook signatures (HMAC-SHA512 of the raw body)', async () => {
    const p = paystackProvider(SECRET)
    const raw = JSON.stringify({ event: 'charge.success', data: { id: 42, reference: 'payses_9', amount: 15000 } })
    const sig = createHmac('sha512', SECRET).update(raw).digest('hex')
    expect(await p.parseWebhook!(raw, { 'x-paystack-signature': sig })).toMatchObject({ id: 'charge.success:42', type: 'payment.captured', sessionId: 'payses_9' })
    expect(await p.parseWebhook!(raw, { 'x-paystack-signature': 'f'.repeat(128) })).toBeNull()
    expect(await p.parseWebhook!(`${raw} `, { 'x-paystack-signature': sig })).toBeNull()
  })
})
