/**
 * Outgoing webhooks. Each delivery is signed with HMAC-SHA256 over `${timestamp}.${body}` and sent
 * with `Kola-Signature: t=<unix>,v1=<hex>`. Failures are retried with exponential backoff; the
 * schedule lives in the delivery row (next_attempt_at), so retries survive serverless restarts and
 * are driven by the webhook-retry cron.
 *
 * Signing secrets are never stored: secret = HMAC(serverKey, salt). Only the salt, a SHA-256 of the
 * secret and its last 4 characters are kept.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import type { DbLike } from '../db/client'
import * as t from '../db/schema'
import { badRequest } from './errors'

export const MAX_ATTEMPTS = 8
/** Minutes to wait after attempt n (1-based). */
const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 720, 1440]

export function nextAttemptDelayMs(attempts: number): number {
  return (BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 1440) * 60_000
}

export function deriveSecret(serverKey: string, salt: string): string {
  return `whsec_${createHmac('sha256', serverKey).update(salt).digest('base64url')}`
}

export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

/** Reject URLs that would let a webhook reach internal services (SSRF). */
export function assertSafeWebhookUrl(raw: string, allowInsecure: boolean) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw badRequest('Enter a valid URL', [{ path: 'url', message: 'Invalid URL' }])
  }
  if (url.protocol !== 'https:' && !(allowInsecure && url.protocol === 'http:')) throw badRequest('Webhook URLs must use https', [{ path: 'url', message: 'Use https' }])
  if (allowInsecure) return
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host)
  if (privateHost) throw badRequest('Webhook URLs must be publicly reachable', [{ path: 'url', message: 'Private address' }])
}

export async function createEndpoint(db: DbLike, serverKey: string, input: { url: string; description?: string | null; events: string[] }) {
  const salt = randomBytes(16).toString('hex')
  const secret = deriveSecret(serverKey, salt)
  const [row] = await db
    .insert(t.webhookEndpoint)
    .values({ url: input.url, description: input.description ?? null, events: input.events, secretSalt: salt, secretHash: createHash('sha256').update(secret).digest('hex'), secretLast4: secret.slice(-4) })
    .returning()
  return { endpoint: row!, secret }
}

/** Queue a delivery for every enabled endpoint subscribed to this event. */
export async function enqueueEvent(db: DbLike, evt: { id: string; name: string; data: Record<string, unknown> }) {
  const endpoints = await db.select().from(t.webhookEndpoint).where(and(eq(t.webhookEndpoint.status, 'enabled'), isNull(t.webhookEndpoint.deletedAt)))
  const targets = endpoints.filter((e) => e.events.includes('*') || e.events.includes(evt.name))
  if (!targets.length) return []
  const payload = { id: evt.id, type: evt.name, created_at: new Date().toISOString(), data: evt.data }
  return db
    .insert(t.webhookDelivery)
    .values(targets.map((e) => ({ endpointId: e.id, eventId: evt.id, eventName: evt.name, payload, nextAttemptAt: new Date() })))
    .returning()
}

export interface DeliverOptions {
  serverKey: string
  fetch?: typeof fetch
  timeoutMs?: number
}

/** Attempt one delivery and record the outcome. */
export async function attemptDelivery(db: DbLike, delivery: typeof t.webhookDelivery.$inferSelect, opts: DeliverOptions) {
  const [endpoint] = await db.select().from(t.webhookEndpoint).where(eq(t.webhookEndpoint.id, delivery.endpointId))
  if (!endpoint || endpoint.deletedAt || endpoint.status !== 'enabled') {
    await db.update(t.webhookDelivery).set({ status: 'failed', lastError: 'Endpoint disabled', nextAttemptAt: null }).where(eq(t.webhookDelivery.id, delivery.id))
    return 'failed' as const
  }
  const body = JSON.stringify(delivery.payload)
  const ts = Math.floor(Date.now() / 1000)
  const secret = deriveSecret(opts.serverKey, endpoint.secretSalt)
  const attempts = delivery.attempts + 1
  let status: number | null = null
  let error: string | null = null
  try {
    const res = await (opts.fetch ?? fetch)(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Kola-Webhooks/1.0',
        'kola-event': delivery.eventName,
        'kola-delivery': delivery.id,
        'kola-signature': `t=${ts},v1=${signPayload(secret, ts, body)}`,
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    })
    status = res.status
    if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 200) : 'Request failed'
  }
  if (!error) {
    await db.update(t.webhookDelivery).set({ status: 'succeeded', attempts, lastResponseStatus: status, lastError: null, deliveredAt: new Date(), nextAttemptAt: null }).where(eq(t.webhookDelivery.id, delivery.id))
    return 'succeeded' as const
  }
  const giveUp = attempts >= MAX_ATTEMPTS
  await db
    .update(t.webhookDelivery)
    .set({ status: giveUp ? 'failed' : 'pending', attempts, lastResponseStatus: status, lastError: error, nextAttemptAt: giveUp ? null : new Date(Date.now() + nextAttemptDelayMs(attempts)) })
    .where(eq(t.webhookDelivery.id, delivery.id))
  return giveUp ? ('failed' as const) : ('retrying' as const)
}

/** Deliver everything that's due. Called by the cron and right after an event is queued. */
export async function deliverDue(db: DbLike, opts: DeliverOptions & { limit?: number }) {
  const due = await db
    .select()
    .from(t.webhookDelivery)
    .where(and(eq(t.webhookDelivery.status, 'pending'), or(isNull(t.webhookDelivery.nextAttemptAt), lte(t.webhookDelivery.nextAttemptAt, new Date()))))
    .orderBy(asc(t.webhookDelivery.createdAt))
    .limit(opts.limit ?? 50)
  const results = { succeeded: 0, retrying: 0, failed: 0 }
  for (const d of due) results[await attemptDelivery(db, d, opts)]++
  return { attempted: due.length, ...results }
}
