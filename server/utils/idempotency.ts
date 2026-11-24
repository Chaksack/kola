import type { H3Event } from 'h3'
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { idempotencyKey } from '../db/schema'

const LOCK_MS = 60_000

/**
 * Run `fn` at most once per Idempotency-Key header. A repeat with the same key returns the stored
 * response; a concurrent repeat gets 409; reusing a key for a different request gets 422.
 * Without the header, `fn` simply runs (callers should still be idempotent by design).
 */
export async function withIdempotency<T>(event: H3Event, scope: string, requestFingerprint: string, fn: () => Promise<T>): Promise<T> {
  const header = getHeader(event, 'idempotency-key')
  if (!header) return fn()
  if (header.length > 200) throw badRequest('Idempotency-Key is too long')
  const db = useDb()
  const key = `${scope}:${header}`
  const requestHash = sha256(requestFingerprint)

  const [claimed] = await db.insert(idempotencyKey).values({ key, scope, requestHash, lockedAt: new Date() }).onConflictDoNothing().returning({ key: idempotencyKey.key })
  if (!claimed) {
    const [row] = await db.select().from(idempotencyKey).where(eq(idempotencyKey.key, key))
    if (row && row.requestHash !== requestHash) throw apiError(422, 'idempotency_key_reused', 'This Idempotency-Key was used for a different request')
    if (row?.responseStatus) {
      setResponseStatus(event, row.responseStatus)
      return row.responseBody as T
    }
    // Take over a lock abandoned by a crashed request; otherwise report it's in flight.
    const [retaken] = await db
      .update(idempotencyKey)
      .set({ lockedAt: new Date() })
      .where(and(eq(idempotencyKey.key, key), isNull(idempotencyKey.responseStatus), or(isNull(idempotencyKey.lockedAt), lt(idempotencyKey.lockedAt, new Date(Date.now() - LOCK_MS)))))
      .returning({ key: idempotencyKey.key })
    if (!retaken) throw apiError(409, 'request_in_progress', 'This request is already being processed')
  }
  try {
    const result = await fn()
    await db.update(idempotencyKey).set({ responseStatus: 200, responseBody: result as unknown, lockedAt: null }).where(eq(idempotencyKey.key, key))
    return result
  } catch (err) {
    // Failed attempts may be retried with the same key.
    await db.delete(idempotencyKey).where(eq(idempotencyKey.key, key))
    throw err
  }
}
