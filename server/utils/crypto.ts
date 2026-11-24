import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/** Random URL-safe token with an optional prefix: `sk_3fA9…`. */
export function randomToken(prefix = '', bytes = 24): string {
  return `${prefix}${randomBytes(bytes).toString('base64url')}`
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function redact(token: string): string {
  return `${token.slice(0, 3)}…${token.slice(-4)}`
}
