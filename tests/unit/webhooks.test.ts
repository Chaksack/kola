import { describe, expect, it } from 'vitest'
import { assertSafeWebhookUrl, deriveSecret, nextAttemptDelayMs, signPayload } from '../../server/services/webhooks'

describe('webhooks', () => {
  it('derives a stable secret from the server key and salt', () => {
    expect(deriveSecret('key', 'salt')).toBe(deriveSecret('key', 'salt'))
    expect(deriveSecret('key', 'salt')).not.toBe(deriveSecret('key', 'other'))
    expect(deriveSecret('key', 'salt')).toMatch(/^whsec_/)
  })
  it('signs timestamp.body with HMAC-SHA256', () => {
    expect(signPayload('whsec_x', 1700000000, '{"a":1}')).toMatch(/^[0-9a-f]{64}$/)
    expect(signPayload('whsec_x', 1700000000, '{"a":1}')).not.toBe(signPayload('whsec_x', 1700000001, '{"a":1}'))
  })
  it('backs off exponentially and caps at a day', () => {
    expect(nextAttemptDelayMs(1)).toBe(60_000)
    expect(nextAttemptDelayMs(3)).toBe(30 * 60_000)
    expect(nextAttemptDelayMs(20)).toBe(24 * 60 * 60_000)
  })
  it.each(['http://example.com', 'https://localhost/hook', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://192.168.1.1/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'not a url'])('blocks %s', (url) => {
    expect(() => assertSafeWebhookUrl(url, false)).toThrow()
  })
  it('allows public https and, in dev, http://localhost', () => {
    expect(() => assertSafeWebhookUrl('https://hooks.example.com/kola', false)).not.toThrow()
    expect(() => assertSafeWebhookUrl('http://localhost:4000/hook', true)).not.toThrow()
  })
})
