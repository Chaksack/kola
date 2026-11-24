import { describe, expect, it } from 'vitest'
import { Client, hasServer } from './client'

describe.skipIf(!hasServer)('security headers', () => {
  it.each(['/', '/admin/login', '/api/store/regions'])('%s sends CSP, HSTS, frame and referrer policies', async (path) => {
    const res = await new Client().request('GET', path)
    const h = res.headers
    expect(h.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(h.get('content-security-policy')).toContain('https://js.stripe.com')
    expect(h.get('strict-transport-security')).toContain('max-age=')
    expect(h.get('x-frame-options')).toBe('DENY')
    expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(h.get('x-content-type-options')).toBe('nosniff')
  })

  it('API responses are never cached', async () => {
    const res = await new Client().request('GET', '/api/admin/auth/me')
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})
